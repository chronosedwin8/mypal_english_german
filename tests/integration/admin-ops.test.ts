import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { can } from "@/server/access";
import { auditCsv, auditQuery } from "@/server/admin/audit";
import { auth } from "@/server/auth/auth";
import { invalidateConfigCache, setConfig } from "@/server/config";
import { db } from "@/server/db";
import { splitBlock } from "@/server/exams/bank/schemas";
import { reportQuestion } from "@/server/exams/reports";

import { readingFixture } from "../fixtures/bank";
import { createTestUser, inDays, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  invalidateConfigCache();
});
afterAll(async () => {
  await db.$disconnect();
});

const asStudent = (u: { id: string }) => ({ id: u.id, role: "STUDENT" as const });

describe("accesos: reglas y excepciones", () => {
  it("un bloqueo por usuario gana sobre la práctica gratis", async () => {
    const u = await createTestUser();
    expect((await can(asStudent(u), "exam.practice")).allowed).toBe(true);
    await db.accessRule.create({ data: { scope: "USER", scopeId: u.id, resource: "exam.practice", allowed: false, reason: "Uso indebido" } });
    expect(await can(asStudent(u), "exam.practice")).toMatchObject({ allowed: false, reason: "Uso indebido" });
  });

  it("una excepción da acceso, pero no regala cupos de corrección", async () => {
    const u = await createTestUser();
    await setConfig("exam.freePractices", 0, null);
    expect((await can(asStudent(u), "exam.practice")).allowed).toBe(false);
    await db.accessRule.createMany({
      data: [
        { scope: "USER", scopeId: u.id, resource: "exam.practice", allowed: true, reason: "Beca" },
        { scope: "USER", scopeId: u.id, resource: "exam.writing", allowed: true, reason: "Beca" },
      ],
    });
    expect((await can(asStudent(u), "exam.practice")).allowed).toBe(true);
    expect((await can(asStudent(u), "exam.writing")).allowed).toBe(false);
  });

  it("una regla vencida se ignora", async () => {
    const u = await createTestUser();
    await db.accessRule.create({ data: { scope: "USER", scopeId: u.id, resource: "exam.practice", allowed: false, reason: "Pausa", expiresAt: inDays(-1) } });
    expect((await can(asStudent(u), "exam.practice")).allowed).toBe(true);
  });
});

describe("cuentas suspendidas", () => {
  it("no pueden abrir sesión nueva", async () => {
    const u = await createTestUser();
    const ctx = await auth.$context;
    await expect(ctx.internalAdapter.createSession(u.id)).resolves.toBeTruthy();
    await db.user.update({ where: { id: u.id }, data: { bannedAt: new Date() } });
    const blocked = await ctx.internalAdapter.createSession(u.id).catch(() => null);
    expect(blocked).toBeFalsy();
    expect(await db.session.count({ where: { userId: u.id } })).toBe(1);
  });
});

describe("reportar preguntas", () => {
  async function seenBlock(n: number) {
    const { content, answerKey } = splitBlock({ kind: "reading", data: readingFixture() });
    const item = await db.examItemSet.create({
      data: {
        exam: "IELTS_ACADEMIC",
        section: "READING",
        part: 1,
        taskTypes: [],
        difficulty: 6.5,
        topic: "test",
        content: content as Prisma.InputJsonValue,
        answerKey: answerKey as Prisma.InputJsonValue,
        status: "APPROVED",
        promptVersion: "test",
        model: "fake",
      },
    });
    const users = [];
    for (let i = 0; i < n; i++) {
      const u = await createTestUser();
      const a = await db.examAttempt.create({ data: { userId: u.id, exam: "IELTS_ACADEMIC", mode: "PART", config: {} } });
      await db.examResponse.create({ data: { attemptId: a.id, itemSetId: item.id, questionId: "1", answer: "TRUE", isCorrect: true } });
      users.push({ user: u, attemptId: a.id });
    }
    return { item, users };
  }

  it("un reporte por persona; con suficientes reportes el bloque sale de circulación", async () => {
    await setConfig("exam.reportsToReview", 2, null);
    const { item, users } = await seenBlock(2);
    const [a, b] = users;
    await expect(reportQuestion(a.user.id, { attemptId: a.attemptId, itemSetId: item.id, questionNumber: 1, reason: "WRONG_KEY" })).resolves.toEqual({ sentToReview: false });
    await expect(reportQuestion(a.user.id, { attemptId: a.attemptId, itemSetId: item.id, questionNumber: 1, reason: "TYPO" })).rejects.toMatchObject({ code: "DUPLICATE" });
    await expect(reportQuestion(b.user.id, { attemptId: b.attemptId, itemSetId: item.id, questionNumber: 3, reason: "AMBIGUOUS", note: "B y C sirven" })).resolves.toEqual({
      sentToReview: true,
    });
    expect((await db.examItemSet.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("REVIEW");
    const flags = await db.moderationFlag.findMany({ where: { kind: "QUESTION" }, orderBy: { createdAt: "asc" } });
    expect(flags.map((f) => [f.refId, f.severity])).toEqual([
      [`${item.id}#1`, "HIGH"],
      [`${item.id}#3`, "MEDIUM"],
    ]);
  });

  it("solo se reporta lo que uno mismo respondió", async () => {
    const { item, users } = await seenBlock(1);
    const other = await createTestUser();
    await expect(reportQuestion(other.id, { attemptId: users[0].attemptId, itemSetId: item.id, questionNumber: 1, reason: "OTHER" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("auditoría", () => {
  it("filtra por autor y exporta CSV sin fórmulas", async () => {
    const admin = await createTestUser({ email: "jefa@test.local", role: "ADMIN" });
    await db.auditLog.createMany({
      data: [
        { actorUserId: admin.id, action: "config.set", entity: "AppConfig", entityId: "x", after: { value: "=HYPERLINK(\"evil\")" } },
        { action: "exam.item_reported_to_review", entity: "ExamItemSet", entityId: "y" },
      ],
    });
    const rows = await auditQuery({ actor: "jefa" }, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].actorEmail).toBe("jefa@test.local");
    const csv = auditCsv(await auditQuery({}, 10));
    expect(csv.split("\r\n")[0]).toBe("id,fecha,autor,accion,entidad,entidad_id,antes,despues");
    expect(csv).toContain('"{""value"":""=HYPERLINK(\\""evil\\"")""}"');
    expect(auditCsv([{ ...rows[0], action: "=cmd" }])).toContain(`"'=cmd"`);
  });
});
