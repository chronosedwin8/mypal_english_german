import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { invalidateConfigCache, setConfig } from "@/server/config";
import { db } from "@/server/db";
import { splitBlock, type AnyBlock } from "@/server/exams/bank/schemas";
import { grantQuota } from "@/server/exams/entitlements";
import {
  PracticeError,
  audioUrl,
  closeExpiredPractice,
  loadPractice,
  loadPracticeResult,
  saveAnswer,
  startPractice,
  submitPractice,
} from "@/server/exams/practice";
import { storage } from "@/server/storage";

import { listeningFixture, readingFixture } from "../fixtures/bank";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  invalidateConfigCache();
  await setConfig("exam.freePractices", 50, null);
});
afterAll(async () => {
  await db.$disconnect();
});

const asStudent = (u: { id: string }) => ({ id: u.id, role: "STUDENT" as const });

async function approvedBlock(block: AnyBlock, section: "READING" | "LISTENING", part: number) {
  const { content, answerKey } = splitBlock(block);
  const item = await db.examItemSet.create({
    data: {
      exam: "IELTS_ACADEMIC",
      section,
      part,
      taskTypes: [...new Set((block.data as { groups: { taskType: string }[] }).groups.map((g) => g.taskType))],
      difficulty: 6.5,
      topic: block.data.topic,
      content: content as Prisma.InputJsonValue,
      answerKey: answerKey as Prisma.InputJsonValue,
      status: "APPROVED",
      promptVersion: "test",
      model: "fake",
    },
  });
  if (section === "LISTENING") {
    const key = `test/audio/${item.id}-0.mp3`;
    await storage().put(key, Buffer.from("x"), "audio/mpeg");
    await db.audioAsset.create({ data: { itemSetId: item.id, storageKey: key, durationMs: 1000, voices: {}, script: [], characters: 10 } });
  }
  return item;
}

describe("practica autocalificada", () => {
  it("por parte: guarda, califica, actualiza dominio y no expone la clave", async () => {
    const user = asStudent(await createTestUser());
    const block = await approvedBlock({ kind: "reading", data: readingFixture() }, "READING", 1);
    const { attemptId } = await startPractice(user, { exam: "IELTS_ACADEMIC", mode: "PART", section: "READING", part: 1 });

    const view = await loadPractice(attemptId, user.id);
    expect(view.blocks[0].questionNumbers).toHaveLength(13);
    expect(view.deadlineAt).not.toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/"answers":\[|"evidence"|explanationEs/);

    await saveAnswer(attemptId, user.id, block.id, "1", "TRUE");
    await saveAnswer(attemptId, user.id, block.id, "2", "TRUE"); // incorrecta (FALSE)
    await saveAnswer(attemptId, user.id, block.id, "7", "Sediment.");
    await saveAnswer(attemptId, user.id, block.id, "8", "local granite stone"); // pasa el limite de 2 palabras
    await expect(saveAnswer(attemptId, user.id, block.id, "99", "x")).rejects.toBeInstanceOf(PracticeError);

    const scores = await submitPractice(attemptId, user.id);
    expect(scores).toMatchObject({ correct: 2, total: 13 });
    expect(scores.byTaskType.TRUE_FALSE_NOT_GIVEN).toEqual({ correct: 1, total: 6 });
    expect(scores.band).not.toBeNull();

    // enviar dos veces no califica dos veces
    await submitPractice(attemptId, user.id);
    const item = await db.examItemSet.findUniqueOrThrow({ where: { id: block.id } });
    expect(item.timesServed).toBe(13);
    expect(item.timesCorrect).toBe(2);
    const mastery = await db.skillMastery.findUniqueOrThrow({ where: { userId_exam_key: { userId: user.id, exam: "IELTS_ACADEMIC", key: "task:SENTENCE_COMPLETION" } } });
    expect(mastery.n).toBe(7);
    expect(mastery.value).toBeCloseTo(1 / 7);
    expect(await db.examResponse.count({ where: { attemptId } })).toBe(13);

    await expect(saveAnswer(attemptId, user.id, block.id, "3", "TRUE")).rejects.toMatchObject({ code: "CLOSED" });
    const result = await loadPracticeResult(attemptId, user.id);
    expect(result?.blocks[0].responses["8"]).toEqual({ value: "local granite stone", isCorrect: false });
  });

  it("por tipo: solo incluye las preguntas de ese tipo y no tiene limite de tiempo", async () => {
    const user = asStudent(await createTestUser());
    await approvedBlock({ kind: "reading", data: readingFixture() }, "READING", 1);
    const { attemptId } = await startPractice(user, { exam: "IELTS_ACADEMIC", mode: "DRILL", section: "READING", taskType: "TRUE_FALSE_NOT_GIVEN" });
    const view = await loadPractice(attemptId, user.id);
    expect(view.blocks[0].questionNumbers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(view.deadlineAt).toBeNull();
    expect((await submitPractice(attemptId, user.id)).total).toBe(6);
  });

  it("prefiere bloques que la persona no ha visto", async () => {
    const user = asStudent(await createTestUser());
    const a = await approvedBlock({ kind: "reading", data: readingFixture() }, "READING", 1);
    const b = await approvedBlock({ kind: "reading", data: readingFixture() }, "READING", 1);
    const first = await startPractice(user, { exam: "IELTS_ACADEMIC", mode: "PART", section: "READING", part: 1 });
    const second = await startPractice(user, { exam: "IELTS_ACADEMIC", mode: "PART", section: "READING", part: 1 });
    const ids = await Promise.all(
      [first, second].map(async (s) => (await db.examSectionAttempt.findFirstOrThrow({ where: { attemptId: s.attemptId } })).itemSetIds[0]),
    );
    expect(new Set(ids)).toEqual(new Set([a.id, b.id]));
  });

  it("sin plan hay una practica gratis; con cupo de examen es ilimitada", async () => {
    await setConfig("exam.freePractices", 1, null);
    const user = asStudent(await createTestUser());
    await approvedBlock({ kind: "reading", data: readingFixture() }, "READING", 1);
    await startPractice(user, { exam: "IELTS_ACADEMIC", mode: "PART", section: "READING", part: 1 });
    await expect(startPractice(user, { exam: "IELTS_ACADEMIC", mode: "PART", section: "READING", part: 1 })).rejects.toMatchObject({ code: "NO_ACCESS" });
    await grantQuota({ userId: user.id, kind: "MOCK", amount: 1, sourceKey: "pase:test", periodStart: new Date(Date.now() - 1000), periodEnd: new Date(Date.now() + 86_400_000) });
    await expect(startPractice(user, { exam: "IELTS_ACADEMIC", mode: "PART", section: "READING", part: 1 })).resolves.toHaveProperty("attemptId");
  });

  it("sin material aprobado avisa en vez de fallar", async () => {
    const user = asStudent(await createTestUser());
    await expect(startPractice(user, { exam: "IELTS_ACADEMIC", mode: "SECTION", section: "READING" })).rejects.toMatchObject({ code: "NO_CONTENT" });
  });

  it("el audio suena una vez en practica por parte y libre en practica por tipo", async () => {
    const user = asStudent(await createTestUser());
    const block = await approvedBlock({ kind: "listening", data: listeningFixture() }, "LISTENING", 4);
    const part = await startPractice(user, { exam: "IELTS_ACADEMIC", mode: "PART", section: "LISTENING", part: 4 });
    expect(await audioUrl(part.attemptId, user.id, block.id, 0)).toMatch(/^memory:/);
    await expect(audioUrl(part.attemptId, user.id, block.id, 0)).rejects.toMatchObject({ code: "AUDIO_LIMIT" });

    const drill = await startPractice(user, { exam: "IELTS_ACADEMIC", mode: "DRILL", section: "LISTENING", taskType: "NOTE_COMPLETION" });
    await audioUrl(drill.attemptId, user.id, block.id, 0);
    await audioUrl(drill.attemptId, user.id, block.id, 0);

    // Otra persona no puede pedir el audio de este intento.
    const other = asStudent(await createTestUser());
    await expect(audioUrl(part.attemptId, other.id, block.id, 0)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("el worker cierra y califica las practicas vencidas", async () => {
    const user = asStudent(await createTestUser());
    const block = await approvedBlock({ kind: "reading", data: readingFixture() }, "READING", 1);
    const { attemptId } = await startPractice(user, { exam: "IELTS_ACADEMIC", mode: "PART", section: "READING", part: 1 });
    await saveAnswer(attemptId, user.id, block.id, "7", "sediment");
    await db.examSectionAttempt.updateMany({ where: { attemptId }, data: { deadlineAt: new Date(Date.now() - 60_000) } });
    await expect(saveAnswer(attemptId, user.id, block.id, "8", "granite")).rejects.toMatchObject({ code: "CLOSED" });
    expect(await closeExpiredPractice()).toBe(1);
    const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("COMPLETED");
    expect((attempt.scores as { correct: number }).correct).toBe(1);
  });
});
