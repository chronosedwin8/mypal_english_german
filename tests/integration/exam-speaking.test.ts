import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { fakeAi } from "@/server/ai/fake";
import { invalidateConfigCache, setConfig } from "@/server/config";
import { db } from "@/server/db";
import { grantQuota, quotaSummary } from "@/server/exams/entitlements";
import { answerSpeaking, speakingState, startSpeaking } from "@/server/exams/speaking";
import { processJobs } from "@/server/jobs/handlers";

import { createTestUser, resetDatabase } from "./helpers";

process.env.ELEVENLABS_EXAM_VOICES_EN = "v1:Alice-UK-F,v2:George-UK-M";
process.env.ELEVENLABS_EXAMINER_EN = "v2";

beforeEach(async () => {
  await resetDatabase();
  invalidateConfigCache();
  fakeAi.reset();
  await setConfig("exam.speaking.part1Questions", 3, null);
  await setConfig("exam.speaking.part3Questions", 3, null);
});
afterAll(async () => {
  await db.$disconnect();
});

async function speakingBlocks() {
  const base = { exam: "IELTS_ACADEMIC" as const, section: "SPEAKING" as const, difficulty: 6.5, status: "APPROVED" as const, promptVersion: "test", model: "fake", answerKey: {} };
  await db.examItemSet.create({
    data: {
      ...base,
      part: 1,
      taskTypes: ["SPEAKING_INTERVIEW"],
      topic: "Home town",
      content: {
        kind: "speaking1",
        frames: [
          { topic: "Your home town", questions: ["Where is your home town?", "What do you like about it?"] },
          { topic: "Music", questions: ["Do you like music?", "When do you listen to music?"] },
        ],
      } as Prisma.InputJsonValue,
    },
  });
  await db.examItemSet.create({
    data: {
      ...base,
      part: 2,
      taskTypes: ["SPEAKING_LONG_TURN"],
      topic: "A useful skill",
      content: {
        kind: "speaking2",
        card: { task: "Describe a useful skill you learned.", cuePoints: ["what it is", "when you learned it", "who taught you"], finalLine: "and explain why it is useful." },
        roundingOff: ["Is it difficult to learn?"],
        discussion: [
          { theme: "Skills at school", questions: ["What skills should schools teach?", "Are practical skills undervalued?"] },
          { theme: "Skills at work", questions: ["How will work skills change?"] },
        ],
      } as Prisma.InputJsonValue,
    },
  });
}

const audio = () => new Blob([new Uint8Array(4000)], { type: "audio/webm" });
const gradeReply = (b: number) => ({
  criteria: Object.fromEntries(["FC", "LR", "GRA", "P"].map((c) => [c, { band: b, commentEs: "Comentario." }])),
  overviewEs: "Amplía tus respuestas con ejemplos.",
  improvements: [{ said: "very good", better: "remarkably useful", explanationEs: "Más preciso." }],
  nextStepsEs: ["Graba respuestas de un minuto."],
});

describe("Speaking con examinador por voz", () => {
  it("recorre las tres partes, repregunta en la Parte 3 y califica cada parte", async () => {
    await speakingBlocks();
    const u = await createTestUser();
    const user = { id: u.id, role: "STUDENT" as const };
    await expect(startSpeaking(user, { exam: "IELTS_ACADEMIC", parts: [1, 2, 3] })).rejects.toMatchObject({ code: "NO_ACCESS" });
    await grantQuota({ userId: u.id, kind: "SPEAKING", amount: 3, sourceKey: "pase:s", periodStart: new Date(Date.now() - 1000), periodEnd: new Date(Date.now() + 86_400_000) });

    const { attemptId } = await startSpeaking(user, { exam: "IELTS_ACADEMIC", parts: [1, 2, 3] });
    expect((await quotaSummary(u.id)).SPEAKING.reserved).toBe(3);
    let state = await speakingState(attemptId, u.id);
    expect(state.current?.part).toBe(1);
    expect(state.current?.waiting?.text).toMatch(/^Good morning\. My name is George.*Where is your home town\?$/);
    expect(state.current?.waiting?.audioUrl).toMatch(/^memory:/);

    // Parte 1: 3 preguntas (limite configurado), con cambio de tema
    for (let i = 0; i < 3; i++) state = await answerSpeaking({ attemptId, userId: u.id, audio: audio(), durationMs: 15_000 });
    expect(state.current?.part).toBe(2);
    expect(state.current?.waiting?.expects).toBe("longturn");
    expect(state.current?.card?.task).toBe("Describe a useful skill you learned.");

    state = await answerSpeaking({ attemptId, userId: u.id, audio: audio(), durationMs: 110_000 });
    expect(state.current?.waiting?.text).toBe("Thank you. Is it difficult to learn?");
    state = await answerSpeaking({ attemptId, userId: u.id, audio: audio(), durationMs: 8_000 });

    // Parte 3: primera pregunta preparada, luego una repregunta de la IA
    expect(state.current?.part).toBe(3);
    expect(state.current?.waiting?.text).toMatch(/^We've been talking about a useful skill you learned.*What skills should schools teach\?$/);
    fakeAi.respond("speaking.examiner", () => ({ followUp: "Why do you think so?" }));
    state = await answerSpeaking({ attemptId, userId: u.id, audio: audio(), durationMs: 30_000 });
    expect(state.current?.waiting?.text).toBe("Why do you think so?");
    state = await answerSpeaking({ attemptId, userId: u.id, audio: audio(), durationMs: 30_000 });
    expect(state.current?.waiting?.text).toBe("Are practical skills undervalued?"); // nunca dos repreguntas seguidas
    state = await answerSpeaking({ attemptId, userId: u.id, audio: audio(), durationMs: 30_000 });
    expect(state.current).toBeNull();
    expect(state.status).toBe("SCORING");
    expect(state.closingAudioUrl).toMatch(/^memory:/);
    await expect(answerSpeaking({ attemptId, userId: u.id, audio: audio(), durationMs: 1000 })).rejects.toMatchObject({ code: "CLOSED" });

    // Calificacion de las tres partes
    fakeAi.respond("speaking.grade", (opts) => {
      expect(opts.audio?.mimeType).toBe("audio/webm");
      return gradeReply(opts.prompt.includes("Part 2") ? 7 : 6);
    });
    expect(await processJobs(5)).toBe(3);
    const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { speaking: true } });
    expect(attempt.status).toBe("COMPLETED");
    expect(attempt.speaking.map((s) => s.finalScore).sort()).toEqual([6, 6, 7]);
    expect(attempt.overall).toBe(6);
    expect((await quotaSummary(u.id)).SPEAKING).toMatchObject({ used: 3, reserved: 0 });
    const metrics = attempt.speaking.find((s) => s.part === 1)!.metrics as { answers: number };
    expect(metrics.answers).toBe(3);
  });

  it("una sola parte usa un solo cupo y otra persona no puede responder", async () => {
    await speakingBlocks();
    const admin = await createTestUser({ role: "ADMIN" });
    const other = await createTestUser();
    const { attemptId } = await startSpeaking({ id: admin.id, role: "ADMIN" }, { exam: "IELTS_ACADEMIC", parts: [2] });
    const state = await speakingState(attemptId, admin.id);
    expect(state.parts).toHaveLength(1);
    expect(state.current?.waiting?.expects).toBe("longturn");
    await expect(answerSpeaking({ attemptId, userId: other.id, audio: audio(), durationMs: 1000 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
