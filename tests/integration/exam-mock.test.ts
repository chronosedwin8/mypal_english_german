import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { fakeAi } from "@/server/ai/fake";
import { invalidateConfigCache } from "@/server/config";
import { db } from "@/server/db";
import { splitBlock, type AnyBlock } from "@/server/exams/bank/schemas";
import { bankTargets } from "@/server/exams/bank/targets";
import { grantQuota, quotaSummary } from "@/server/exams/entitlements";
import { mockView, skipMockSpeaking, startMock, startMockStage, submitMockWriting, syncMock } from "@/server/exams/mock";
import { saveAnswer, submitPractice } from "@/server/exams/practice";
import { processJobs } from "@/server/jobs/handlers";

import { listeningFixture, readingFixture } from "../fixtures/bank";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  invalidateConfigCache();
  fakeAi.reset();
});
afterAll(async () => {
  await db.$disconnect();
});

const ESSAY = Array.from({ length: 30 }, () => "Technology gives students access to information and new ways to learn together.").join(" ");

/** Un bloque aprobado por cada parte del banco IELTS. */
async function fullBank() {
  for (const t of bankTargets("IELTS_ACADEMIC")) {
    let content: Record<string, unknown>;
    let answerKey: Record<string, unknown>;
    if (t.kind === "reading" || t.kind === "listening") {
      const block = (t.kind === "reading" ? { kind: "reading", data: readingFixture() } : { kind: "listening", data: listeningFixture() }) as AnyBlock;
      ({ content, answerKey } = splitBlock(block));
    } else if (t.kind === "writing1" || t.kind === "writing2") {
      content = { kind: t.kind, prompt: "Write about the topic. Write at least 150 words.", ...(t.kind === "writing1" ? { chart: { kind: "bar", title: "T", unit: "%", categories: ["a", "b"], series: [{ name: "x", values: [1, 2] }] } } : {}) };
      answerKey = { kind: t.kind, keyFeatures: ["a"], keyIdeas: ["b"], modelAnswer: "Model." };
    } else if (t.kind === "speaking1") {
      content = { kind: "speaking1", frames: [{ topic: "Home", questions: ["Where do you live?"] }] };
      answerKey = {};
    } else {
      content = {
        kind: "speaking2",
        card: { task: "Describe a place.", cuePoints: ["where"], finalLine: "and explain why." },
        roundingOff: ["Do you go often?"],
        discussion: [{ theme: "Places", questions: ["Why do places matter?"] }],
      };
      answerKey = {};
    }
    await db.examItemSet.create({
      data: {
        exam: t.exam,
        section: t.section,
        part: t.part,
        taskTypes: [],
        difficulty: 6.5,
        topic: `${t.section} ${t.part}`,
        content: content as Prisma.InputJsonValue,
        answerKey: answerKey as Prisma.InputJsonValue,
        status: "APPROVED",
        promptVersion: "test",
        model: "fake",
      },
    });
  }
}

describe("simulacro completo", () => {
  it("ordena las secciones, usa el cupo y arma el informe", async () => {
    await fullBank();
    const u = await createTestUser();
    const user = { id: u.id, role: "STUDENT" as const };
    await expect(startMock(user, "IELTS_ACADEMIC")).rejects.toMatchObject({ code: "NO_ACCESS" });
    await grantQuota({ userId: u.id, kind: "MOCK", amount: 1, sourceKey: "pase:m", periodStart: new Date(Date.now() - 1000), periodEnd: new Date(Date.now() + 86_400_000) });

    const { mockId } = await startMock(user, "IELTS_ACADEMIC"); // arma la forma 1 automaticamente
    expect((await startMock(user, "IELTS_ACADEMIC")).mockId).toBe(mockId); // un solo simulacro abierto
    expect((await quotaSummary(u.id)).MOCK).toMatchObject({ reserved: 1, available: 0 });

    await expect(startMockStage(mockId, user, "READING")).rejects.toMatchObject({ code: "ORDER" });

    // Listening: se descuenta el cupo al empezar
    const lUrl = await startMockStage(mockId, user, "LISTENING");
    const listeningId = lUrl.split("/").pop()!;
    expect((await quotaSummary(u.id)).MOCK).toMatchObject({ used: 1, reserved: 0 });
    const lBlock = (await db.examSectionAttempt.findFirstOrThrow({ where: { attemptId: listeningId } })).itemSetIds[0];
    await saveAnswer(listeningId, u.id, lBlock, "31", "copper");
    await submitPractice(listeningId, u.id);
    await syncMock(mockId);
    await expect(startMockStage(mockId, user, "LISTENING")).rejects.toMatchObject({ code: "ORDER" }); // no se vuelve atras

    const rUrl = await startMockStage(mockId, user, "READING");
    await submitPractice(rUrl.split("/").pop()!, u.id);
    await syncMock(mockId);

    // Writing: dos tareas con un solo reloj
    expect(await startMockStage(mockId, user, "WRITING")).toBe(`/app/examenes/simulacro/${mockId}/writing`);
    const view = await mockView(mockId, u.id);
    const [w1, w2] = view.config.stages.WRITING.attemptIds;
    await submitMockWriting(mockId, user, { [w1]: ESSAY, [w2]: ESSAY });
    expect((await quotaSummary(u.id)).WRITING.reserved).toBe(0); // el simulacro no usa cupos de Writing

    await skipMockSpeaking(mockId, u.id);
    expect((await db.examAttempt.findUniqueOrThrow({ where: { id: mockId } })).status).toBe("SCORING");

    const grade = (b: number) => ({ criteria: Object.fromEntries(["TA", "CC", "LR", "GRA"].map((c) => [c, { band: b, commentEs: "Bien hecho." }])) });
    fakeAi.respond("writing.grade", (opts) =>
      opts.prompt.includes("Also give feedback")
        ? { ...grade(6), overviewEs: "Bien encaminado.", errors: [], improvedVersion: "An improved version of the text with more precise vocabulary.", nextStepsEs: [] }
        : grade(6),
    );
    fakeAi.respond("report.narrative", () => ({ narrativeEs: "Buen comienzo: tu Writing está en banda 6 y Listening necesita más práctica.", improvements: [{ titleEs: "Listening", detailEs: "Practica notas." }] }));
    expect(await processJobs(5)).toBe(2);
    await syncMock(mockId);

    const done = await mockView(mockId, u.id);
    expect(done.mock.status).toBe("COMPLETED");
    expect(done.scores?.listening).toMatchObject({ correct: 1, total: 40, band: 1 });
    expect(done.scores?.writing?.band).toBe(6);
    expect(done.scores?.speaking).toBeNull();
    expect(done.scores?.overall).toBeNull(); // sin Speaking no hay banda general
    expect(done.report?.narrative).toMatch(/banda 6/);
    expect((await quotaSummary(u.id)).MOCK).toMatchObject({ used: 1, reserved: 0 });
  });
});
