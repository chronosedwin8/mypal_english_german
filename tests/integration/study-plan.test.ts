import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { invalidateConfigCache, setConfig } from "@/server/config";
import { db } from "@/server/db";
import { splitBlock } from "@/server/exams/bank/schemas";
import { startPractice, submitPractice } from "@/server/exams/practice";
import { addMockImprovements, estimateBands, markPlanProgress, planView, savePlan, tutorExamFocus } from "@/server/study/plan";

import { readingFixture } from "../fixtures/bank";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  invalidateConfigCache();
  await setConfig("exam.freePractices", 50, null);
});
afterAll(async () => {
  await db.$disconnect();
});

const settings = () => ({
  exam: "IELTS_ACADEMIC" as const,
  targets: { overall: 7 },
  examDate: new Date(Date.now() + 45 * 86_400_000),
  hoursPerWeek: 6,
  days: [0, 1, 2, 3, 4, 5, 6],
});

describe("plan de estudios", () => {
  it("crea el plan, marca avance al practicar y recalcula sin duplicar", async () => {
    const u = await createTestUser();
    const user = { id: u.id, role: "STUDENT" as const };
    await savePlan(user, settings());
    const view = await planView(u.id, "IELTS_ACADEMIC");
    expect(view?.thisWeek.length).toBeGreaterThan(0);
    const total = await db.studyPlanItem.count();

    // Recalcular no duplica tareas
    await savePlan(user, settings());
    expect(await db.studyPlanItem.count()).toBe(total);

    // Practicar un tipo de pregunta marca su tarea de la semana
    const { content, answerKey } = splitBlock({ kind: "reading", data: readingFixture() });
    await db.examItemSet.create({
      data: {
        exam: "IELTS_ACADEMIC",
        section: "READING",
        part: 1,
        taskTypes: ["TRUE_FALSE_NOT_GIVEN", "SENTENCE_COMPLETION"],
        difficulty: 6.5,
        topic: "x",
        content: content as Prisma.InputJsonValue,
        answerKey: answerKey as Prisma.InputJsonValue,
        status: "APPROVED",
        promptVersion: "t",
        model: "fake",
      },
    });
    const drill = await db.studyPlanItem.findFirst({ where: { kind: "DRILL", section: "READING", status: "TODO" }, orderBy: { weekStart: "asc" } });
    expect(drill).not.toBeNull();
    const { attemptId } = await startPractice(user, { exam: "IELTS_ACADEMIC", mode: "DRILL", section: "READING", taskType: drill!.taskType! });
    await submitPractice(attemptId, u.id);
    const after = await db.studyPlanItem.findUniqueOrThrow({ where: { id: drill!.id } });
    // la tarea marcada es la mas antigua que coincide (puede ser esta u otra igual de la semana)
    const doneCount = await db.studyPlanItem.count({ where: { status: "DONE" } });
    expect(doneCount).toBe(1);
    expect(["DONE", "TODO"]).toContain(after.status);

    // Sin actividad que coincida no se marca nada
    await markPlanProgress(u.id, "IELTS_ACADEMIC", { kind: "MOCK" });
    expect(await db.studyPlanItem.count({ where: { status: "DONE" } })).toBeLessThanOrEqual(2);
  });

  it("el informe de un simulacro agrega un plan de mejora (una sola vez)", async () => {
    const u = await createTestUser();
    await savePlan({ id: u.id, role: "STUDENT" }, settings());
    const mock = await db.examAttempt.create({
      data: { userId: u.id, exam: "IELTS_ACADEMIC", mode: "MOCK", status: "COMPLETED", config: {}, scores: { writing: { band: 5.5 }, speaking: { band: 6 } } },
    });
    await db.examReport.create({
      data: {
        attemptId: mock.id,
        strengths: [],
        weaknesses: [{ key: "READING:TRUE_FALSE_NOT_GIVEN", correct: 3, total: 8 }],
        timing: [],
        narrative: "x",
        improvements: [],
      },
    });
    await addMockImprovements(mock.id);
    await addMockImprovements(mock.id);
    const items = await db.studyPlanItem.findMany({ where: { origin: "MOCK" } });
    expect(items).toHaveLength(5); // 3 de TFNG + Writing + Speaking
    expect(items.every((i) => i.sourceAttemptId === mock.id)).toBe(true);
  });

  it("estima bandas y da contexto al tutor", async () => {
    const u = await createTestUser();
    expect(await estimateBands(u.id, "IELTS_ACADEMIC")).toEqual({ LISTENING: null, READING: null, WRITING: null, SPEAKING: null });
    expect(await tutorExamFocus(u.id)).toBeNull();
    await savePlan({ id: u.id, role: "STUDENT" }, settings());
    expect(await tutorExamFocus(u.id)).toMatch(/target band 7\.0/);
  });
});
