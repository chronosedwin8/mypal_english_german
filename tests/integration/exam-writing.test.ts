import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { fakeAi } from "@/server/ai/fake";
import { invalidateConfigCache } from "@/server/config";
import { db } from "@/server/db";
import { grantQuota, quotaSummary } from "@/server/exams/entitlements";
import { WritingError, combineGrades, gradeWriting, loadWriting, saveWritingDraft, startWriting, submitWriting, taskBand } from "@/server/exams/writing";
import { processJobs } from "@/server/jobs/handlers";

import { createTestUser, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  invalidateConfigCache();
  fakeAi.reset();
});
afterAll(async () => {
  await db.$disconnect();
});

const ESSAY = Array.from({ length: 30 }, () => "Many people believe that technology improves education because it gives students access to information.").join(" ");

const grade = (b: number) => ({
  criteria: Object.fromEntries(["TA", "CC", "LR", "GRA"].map((c) => [c, { band: b, commentEs: "Comentario de prueba." }])),
});
const feedback = (b: number) => ({
  ...grade(b),
  overviewEs: "Desarrolla más tus ideas.",
  errors: [
    { quote: "gives students access", correction: "gives students access", explanationEs: "Bien usado.", type: "grammar" },
    { quote: "texto que no existe", correction: "x", explanationEs: "No aparece en el texto.", type: "grammar" },
  ],
  improvedVersion: "An improved version of the essay with better cohesion and a wider range of vocabulary.",
  nextStepsEs: ["Usa conectores variados."],
});

async function task2Block() {
  return db.examItemSet.create({
    data: {
      exam: "IELTS_ACADEMIC",
      section: "WRITING",
      part: 2,
      taskTypes: ["ESSAY"],
      difficulty: 6.5,
      topic: "Technology in education",
      content: { kind: "writing2", prompt: "Some people think technology improves education. Discuss. Write at least 250 words.", essayType: "opinion" } as Prisma.InputJsonValue,
      answerKey: { kind: "writing2", keyIdeas: ["access", "distraction"], modelAnswer: "Model answer." } as Prisma.InputJsonValue,
      status: "APPROVED",
      promptVersion: "test",
      model: "fake",
    },
  });
}

const period = () => ({ periodStart: new Date(Date.now() - 1000), periodEnd: new Date(Date.now() + 86_400_000) });

describe("Writing con correccion por IA", () => {
  it("sin cupo no se puede empezar; el administrador si", async () => {
    await task2Block();
    const student = await createTestUser();
    await expect(startWriting({ id: student.id, role: "STUDENT" }, { exam: "IELTS_ACADEMIC", task: 2, timed: false })).rejects.toMatchObject({ code: "NO_ACCESS" });
    const admin = await createTestUser({ role: "ADMIN" });
    await expect(startWriting({ id: admin.id, role: "ADMIN" }, { exam: "IELTS_ACADEMIC", task: 2, timed: false })).resolves.toHaveProperty("attemptId");
  });

  it("entregar reserva el cupo; calificar lo consume y guarda la nota", async () => {
    await task2Block();
    const u = await createTestUser();
    const user = { id: u.id, role: "STUDENT" as const };
    await grantQuota({ userId: u.id, kind: "WRITING", amount: 2, sourceKey: "pase:w", ...period() });
    const { attemptId } = await startWriting(user, { exam: "IELTS_ACADEMIC", task: 2, timed: true });
    await saveWritingDraft(attemptId, u.id, "borrador");
    await expect(submitWriting(attemptId, user, "Too short.")).rejects.toMatchObject({ code: "TOO_SHORT" });

    const sub = await submitWriting(attemptId, user, ESSAY);
    expect(sub.words).toBeGreaterThan(250);
    expect((await quotaSummary(u.id)).WRITING).toMatchObject({ reserved: 1, available: 1 });
    // entregar otra vez no reserva dos veces
    await submitWriting(attemptId, user);
    expect((await quotaSummary(u.id)).WRITING.reserved).toBe(1);

    fakeAi.respond("writing.grade", (opts) => (opts.prompt.includes("Also give feedback") ? feedback(7) : grade(6)));
    expect(await processJobs(2)).toBe(1);

    const view = await loadWriting(attemptId, u.id);
    expect(view.submission?.status).toBe("GRADED");
    expect(view.submission?.band).toBe(6.5);
    expect(view.submission?.feedback?.graders).toBe(2);
    expect(view.submission?.feedback?.errors).toHaveLength(1); // la cita inventada se descarta
    expect((await quotaSummary(u.id)).WRITING).toMatchObject({ used: 1, reserved: 0, available: 1 });
    expect((await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId } })).status).toBe("COMPLETED");
  });

  it("si los calificadores difieren mas de una banda, decide un tercero", async () => {
    await task2Block();
    const admin = await createTestUser({ role: "ADMIN" });
    const user = { id: admin.id, role: "ADMIN" as const };
    const { attemptId } = await startWriting(user, { exam: "IELTS_ACADEMIC", task: 2, timed: false });
    const sub = await submitWriting(attemptId, user, ESSAY);
    let call = 0;
    fakeAi.respond("writing.grade", (opts) => {
      if (opts.prompt.includes("Also give feedback")) return feedback(8);
      call++;
      return grade(call === 1 ? 5 : 6);
    });
    const r = await gradeWriting(sub.id, { finalAttempt: false });
    expect(r.band).toBe(6); // mediana de 8, 5 y 6
    const saved = await db.writingSubmission.findUniqueOrThrow({ where: { id: sub.id } });
    expect((saved.grades as unknown[]).length).toBe(3);
  });

  it("si falla de nuestro lado en el ultimo intento, devuelve el cupo", async () => {
    await task2Block();
    const u = await createTestUser();
    const user = { id: u.id, role: "STUDENT" as const };
    await grantQuota({ userId: u.id, kind: "WRITING", amount: 1, sourceKey: "pase:f", ...period() });
    const { attemptId } = await startWriting(user, { exam: "IELTS_ACADEMIC", task: 2, timed: false });
    const sub = await submitWriting(attemptId, user, ESSAY);
    // sin respuesta registrada en el simulador → la IA "falla"
    await expect(gradeWriting(sub.id, { finalAttempt: false })).rejects.toThrow();
    expect((await quotaSummary(u.id)).WRITING.reserved).toBe(1);
    await expect(gradeWriting(sub.id, { finalAttempt: true })).rejects.toThrow();
    expect((await quotaSummary(u.id)).WRITING).toMatchObject({ reserved: 0, available: 1 });
    expect((await db.writingSubmission.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("FAILED");
  });

  it("no se puede escribir en una tarea ajena", async () => {
    await task2Block();
    const admin = await createTestUser({ role: "ADMIN" });
    const other = await createTestUser();
    const { attemptId } = await startWriting({ id: admin.id, role: "ADMIN" }, { exam: "IELTS_ACADEMIC", task: 2, timed: false });
    await expect(saveWritingDraft(attemptId, other.id, "x")).rejects.toBeInstanceOf(WritingError);
  });
});

describe("bandas de Writing", () => {
  it("promedia criterios y redondea hacia abajo a media banda", () => {
    expect(taskBand({ TA: { band: 6 }, CC: { band: 7 }, LR: { band: 6 }, GRA: { band: 6 } })).toBe(6);
    expect(taskBand({ TA: { band: 7 }, CC: { band: 7 }, LR: { band: 6 }, GRA: { band: 6 } })).toBe(6.5);
    expect(combineGrades([grade(6), grade(7)] as never).TA).toBe(6.5);
  });
});
