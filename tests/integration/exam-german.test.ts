import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { fakeAi } from "@/server/ai/fake";
import { invalidateConfigCache, setConfig } from "@/server/config";
import { db } from "@/server/db";
import { objectiveScale, productiveScale } from "@/server/exams/profiles";
import { answerSpeaking, speakingState, startSpeaking } from "@/server/exams/speaking";
import { gradeWriting, loadWriting, startWriting, submitWriting } from "@/server/exams/writing";
import { stageOrder } from "@/server/exams/mock";
import { processJobs } from "@/server/jobs/handlers";

import { createTestUser, resetDatabase } from "./helpers";

process.env.ELEVENLABS_EXAM_VOICES_DE = "d1:Milly-F,d2:Simon-M,d3:Ellen-F";
process.env.ELEVENLABS_EXAMINER_DE = "d2";

beforeEach(async () => {
  await resetDatabase();
  invalidateConfigCache();
  fakeAi.reset();
});
afterAll(async () => {
  await db.$disconnect();
});

const base = { exam: "GOETHE_B2" as const, difficulty: 6, status: "APPROVED" as const, promptVersion: "t", model: "fake", topic: "Homeoffice" };
const TEXT = Array.from({ length: 20 }, () => "Ich finde Homeoffice praktisch, weil man Zeit spart und flexibler arbeiten kann.").join(" ");

describe("escalas de los examenes de aleman", () => {
  it("Goethe: puntos 0–100 y aprobado con 60; TestDaF: escala 0–20 y TDN", () => {
    expect(objectiveScale("GOETHE_B2", "READING", 18, 30, { full: true })).toMatchObject({ value: 60, label: "60 puntos", pass: true });
    expect(objectiveScale("GOETHE_B2", "READING", 17, 30, { full: true })?.pass).toBe(false);
    expect(objectiveScale("TESTDAF", "LISTENING", 22, 30, { full: true })?.label).toMatch(/^TDN 4/);
    expect(productiveScale("GOETHE_B2", [4, 4, 3, 3])).toMatchObject({ value: 70, pass: true });
    expect(productiveScale("TESTDAF", [5, 5, 4]).label).toMatch(/^TDN 5/);
    expect(stageOrder("GOETHE_B2")[0]).toBe("READING");
    expect(stageOrder("IELTS_ACADEMIC")[0]).toBe("LISTENING");
  });
});

describe("Schreiben (Goethe B2)", () => {
  it("califica con criterios Goethe y da puntos con aprobado", async () => {
    await db.examItemSet.create({
      data: {
        ...base,
        section: "WRITING",
        part: 1,
        taskTypes: ["FORUM_POST"],
        content: { kind: "writingTask", prompt: "Schreiben Sie einen Forumsbeitrag zum Thema Homeoffice.", register: "neutral", contentPoints: ["Vorteile", "Nachteile"], chart: null } as Prisma.InputJsonValue,
        answerKey: { kind: "writingTask", keyIdeas: ["Vorteile"], modelAnswer: "Modell." } as Prisma.InputJsonValue,
      },
    });
    const admin = await createTestUser({ role: "ADMIN" });
    const user = { id: admin.id, role: "ADMIN" as const };
    const { attemptId } = await startWriting(user, { exam: "GOETHE_B2", task: 1, timed: false });
    const sub = await submitWriting(attemptId, user, TEXT);
    const grade = (n: number) => ({ criteria: Object.fromEntries(["ERF", "KOH", "WOR", "STR"].map((k) => [k, { score: n, commentEs: "Buen trabajo." }])) });
    fakeAi.respond("writing.grade", (opts) =>
      opts.prompt.includes("Also give")
        ? { ...grade(4), overviewEs: "Desarrolla más los ejemplos.", errors: [], improvedVersion: "Eine verbesserte Version des Textes mit mehr Beispielen.", nextStepsEs: [] }
        : grade(4),
    );
    const r = await gradeWriting(sub.id, { finalAttempt: true });
    expect(r.band).toBe(80);
    const view = await loadWriting(attemptId, admin.id);
    expect(view.partTitle).toBe("Teil 1");
    expect(view.submission?.feedback?.scale).toMatchObject({ value: 80, pass: true });
    expect(view.submission?.feedback?.criteriaLabels?.ERF).toMatch(/Erfüllung/);
  });
});

describe("Sprechen (Goethe B2) con compañero virtual", () => {
  it("presentación con preguntas y discusión con el compañero; nota en puntos", async () => {
    await setConfig("exam.speaking.part3Questions", 2, null);
    await db.examItemSet.create({
      data: {
        ...base,
        section: "SPEAKING",
        part: 1,
        taskTypes: ["SPEAKING_PRESENTATION"],
        content: {
          kind: "speakingTask",
          mode: "presentation",
          situation: "Halten Sie einen Vortrag über Homeoffice.",
          points: ["Erfahrungen", "Vorteile", "Nachteile"],
          partnerView: null,
          questions: ["Arbeiten Sie selbst gern zu Hause?", "Was sagt Ihr Chef dazu?"],
        } as Prisma.InputJsonValue,
        answerKey: {},
      },
    });
    await db.examItemSet.create({
      data: {
        ...base,
        section: "SPEAKING",
        part: 2,
        taskTypes: ["SPEAKING_DISCUSSION"],
        content: {
          kind: "speakingTask",
          mode: "discussion",
          situation: "Diskutieren Sie: Sollten Städte autofrei sein?",
          points: ["Umwelt", "Wirtschaft"],
          partnerView: "Ich bin dafür, weil die Luft besser wird.",
          questions: ["Was meinen Sie?", "Und was ist mit den Geschäften?", "Gibt es einen Kompromiss?"],
        } as Prisma.InputJsonValue,
        answerKey: {},
      },
    });
    const admin = await createTestUser({ role: "ADMIN" });
    const { attemptId } = await startSpeaking({ id: admin.id, role: "ADMIN" }, { exam: "GOETHE_B2", parts: [1, 2] });
    let state = await speakingState(attemptId, admin.id);
    expect(state.parts.map((p) => p.title)).toEqual(["Teil 1", "Teil 2"]);
    expect(state.current?.waiting).toMatchObject({ expects: "longturn" });
    expect(state.current?.waiting?.text).toMatch(/^Teil 1\. Halten Sie einen Vortrag/);
    expect(state.current?.card?.cuePoints).toEqual(["Erfahrungen", "Vorteile", "Nachteile"]);
    expect(state.limits.prepSeconds).toBeLessThanOrEqual(180); // la preparacion real (15 min) se acorta

    const audio = () => new Blob([new Uint8Array(4000)], { type: "audio/webm" });
    state = await answerSpeaking({ attemptId, userId: admin.id, audio: audio(), durationMs: 200_000 });
    expect(state.current?.waiting?.text).toBe("Arbeiten Sie selbst gern zu Hause?");
    state = await answerSpeaking({ attemptId, userId: admin.id, audio: audio(), durationMs: 20_000 });
    // Teil 2: el companero opina y pregunta
    expect(state.current?.part).toBe(2);
    expect(state.current?.waiting?.text).toMatch(/Ich bin dafür, weil die Luft besser wird\. Was meinen Sie\?$/);
    state = await answerSpeaking({ attemptId, userId: admin.id, audio: audio(), durationMs: 30_000 });
    expect(state.current?.waiting?.text).toBe("Und was ist mit den Geschäften?");
    state = await answerSpeaking({ attemptId, userId: admin.id, audio: audio(), durationMs: 30_000 });
    expect(state.current).toBeNull();

    // la voz del companero es distinta a la del examinador
    const sub2 = await db.speakingSubmission.findFirstOrThrow({ where: { attemptId, part: 2 } });
    expect((sub2.turns as { speaker?: string }[]).some((t) => t.speaker === "partner")).toBe(true);

    fakeAi.respond("speaking.grade", () => ({
      criteria: Object.fromEntries(["ERF", "KOH", "WOR", "STR", "AUS"].map((k) => [k, { score: 3, commentEs: "Bien hecho." }])),
      overviewEs: "Usa más conectores.",
      improvements: [],
      nextStepsEs: [],
    }));
    expect(await processJobs(5)).toBe(2);
    const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("COMPLETED");
    expect(attempt.overall).toBe(60);
    expect((attempt.scores as { scale: { pass: boolean } }).scale.pass).toBe(true);
  });
});
