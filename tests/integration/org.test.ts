import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { can } from "@/server/access";
import { invalidateConfigCache } from "@/server/config";
import { db } from "@/server/db";
import { splitBlock } from "@/server/exams/bank/schemas";
import { quotaSummary } from "@/server/exams/entitlements";
import { startPractice, submitPractice } from "@/server/exams/practice";
import { acceptInvitation, addLicenses, createInvitation, createOrganization, isMinorUser, removeMember } from "@/server/org";
import {
  addTeacherReview,
  createAssignment,
  createGroup,
  groupCsv,
  groupOverview,
  latestTeacherReview,
  requireGroupAccess,
  requireStudentAccess,
  studentAssignments,
} from "@/server/org/teaching";

import { readingFixture } from "../fixtures/bank";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  invalidateConfigCache();
});
afterAll(async () => {
  await db.$disconnect();
});

const yearsAgo = (n: number) => new Date(Date.UTC(new Date().getUTCFullYear() - n, 0, 1));

async function school(opts: { minors?: boolean; seats?: number } = {}) {
  const admin = await createTestUser();
  const org = await createOrganization({ name: "Colegio San José", type: "SCHOOL", enabledExams: ["IELTS_ACADEMIC"], adminUserId: admin.id });
  if (opts.minors) await db.organization.update({ where: { id: org.id }, data: { allowsMinors: true, minorsDeclarationAt: new Date() } });
  await addLicenses({ orgId: org.id, kind: "estandar", seats: opts.seats ?? 2, months: 6 });
  return { org, admin };
}

async function join(orgId: string, role: "STUDENT" | "TEACHER", opts: { groupId?: string; birthDate?: Date } = {}) {
  const u = await createTestUser();
  const inv = await createInvitation({ orgId, role, groupId: opts.groupId, birthDate: opts.birthDate });
  const memberId = await acceptInvitation({ code: inv.code, userId: u.id, email: u.email });
  return { user: u, memberId };
}

describe("instituciones: licencias y altas", () => {
  it("cada estudiante ocupa una licencia y recibe los cupos de su licencia", async () => {
    const { org } = await school({ seats: 2 });
    const a = await join(org.id, "STUDENT");
    await join(org.id, "STUDENT");
    await expect(join(org.id, "STUDENT")).rejects.toMatchObject({ code: "NO_SEATS" });
    // los docentes no ocupan licencia
    await expect(join(org.id, "TEACHER")).resolves.toHaveProperty("memberId");
    expect(await quotaSummary(a.user.id)).toMatchObject({ MOCK: { available: 1 }, WRITING: { available: 4 }, SPEAKING: { available: 4 } });
    expect((await can({ id: a.user.id, role: "STUDENT" }, "exam.practice")).allowed).toBe(true);

    await removeMember(org.id, a.memberId);
    const lic = await db.orgLicense.findFirstOrThrow({ where: { orgId: org.id } });
    expect(lic.used).toBe(1);
    await expect(db.orgLicense.update({ where: { id: lic.id }, data: { used: 5 } })).rejects.toThrow(); // CHECK used <= seats
  });

  it("menores: desde 15 años, solo si la institución los admite, con restricciones", async () => {
    const closed = await school();
    await expect(join(closed.org.id, "STUDENT", { birthDate: yearsAgo(16) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createInvitation({ orgId: closed.org.id, role: "STUDENT", birthDate: yearsAgo(13) })).rejects.toMatchObject({ code: "TOO_YOUNG" });

    const open = await school({ minors: true });
    const minor = await join(open.org.id, "STUDENT", { birthDate: yearsAgo(16) });
    expect(await isMinorUser(minor.user.id)).toBe(true);
    const user = { id: minor.user.id, role: "STUDENT" as const };
    expect((await can(user, "exam.practice")).allowed).toBe(true);
    expect((await can(user, "exam.writing")).allowed).toBe(false); // sin proveedor de IA para menores
    expect((await can(user, "tutor.avatar")).allowed).toBe(false);
    await db.organization.update({ where: { id: open.org.id }, data: { avatarForMinors: true } });
    expect((await can(user, "tutor.avatar")).allowed).toBe(true);
  });
});

describe("panel docente", () => {
  it("permisos, tareas que se cumplen, revisión y exportación", async () => {
    const { org } = await school({ seats: 5 });
    const teacher = await join(org.id, "TEACHER");
    const group = await createGroup({ orgId: org.id, name: "11A IELTS", exam: "IELTS_ACADEMIC", targetScore: 6.5, teacherMemberId: teacher.memberId });
    const other = await join(org.id, "TEACHER");
    const s1 = await join(org.id, "STUDENT", { groupId: group.id });
    await join(org.id, "STUDENT", { groupId: group.id });

    const teacherUser = { id: teacher.user.id, role: "STUDENT" };
    await expect(requireGroupAccess(teacherUser, group.id)).resolves.toBeTruthy();
    await expect(requireGroupAccess({ id: other.user.id, role: "STUDENT" }, group.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireStudentAccess({ id: other.user.id, role: "STUDENT" }, s1.memberId)).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Tarea de practica: aparece al estudiante y se cumple al entregar
    const { content, answerKey } = splitBlock({ kind: "reading", data: readingFixture() });
    await db.examItemSet.create({
      data: { exam: "IELTS_ACADEMIC", section: "READING", part: 1, taskTypes: [], difficulty: 6.5, topic: "x", content: content as Prisma.InputJsonValue, answerKey: answerKey as Prisma.InputJsonValue, status: "APPROVED", promptVersion: "t", model: "fake" },
    });
    const a = await createAssignment({
      groupId: group.id,
      createdBy: teacher.memberId,
      kind: "PRACTICE",
      title: "Passage 1",
      config: { mode: "PART", section: "READING", part: 1 },
      opensAt: new Date(Date.now() - 1000),
      closesAt: new Date(Date.now() + 86_400_000),
    });
    expect(await studentAssignments(s1.user.id)).toHaveLength(1);
    const { attemptId } = await startPractice({ id: s1.user.id, role: "STUDENT" }, { exam: "IELTS_ACADEMIC", mode: "PART", section: "READING", part: 1, assignmentId: a.id });
    await submitPractice(attemptId, s1.user.id);
    const result = await db.assignmentResult.findUniqueOrThrow({ where: { assignmentId_memberId: { assignmentId: a.id, memberId: s1.memberId } } });
    expect(result).toMatchObject({ status: "DONE", attemptId });

    const overview = await groupOverview(group.id);
    expect(overview.kpis).toMatchObject({ students: 2, active7: 1, assignmentCompletion: 0.5 });
    expect(overview.students.find((s) => s.memberId === s1.memberId)?.status).not.toBe("INACTIVE");

    // Revision humana: la nota del docente queda como vigente y no se puede editar
    const attempt = await db.examAttempt.create({ data: { userId: s1.user.id, exam: "IELTS_ACADEMIC", mode: "WRITING", status: "COMPLETED", config: {} } });
    const sub = await db.writingSubmission.create({ data: { attemptId: attempt.id, taskNumber: 2, itemSetId: "x", text: "text", words: 1, status: "GRADED", finalScore: 6 } });
    await addTeacherReview(teacherUser, { kind: "WRITING", submissionId: sub.id, score: 5.5, reason: "No responde la pregunta" });
    await addTeacherReview(teacherUser, { kind: "WRITING", submissionId: sub.id, score: 6.5, reason: "Revisé de nuevo" });
    expect((await latestTeacherReview(sub.id))?.score).toBe(6.5);
    await expect(db.teacherReview.deleteMany({})).rejects.toThrow(); // solo insercion
    await expect(addTeacherReview({ id: other.user.id, role: "STUDENT" }, { kind: "WRITING", submissionId: sub.id, score: 9, reason: "x x x" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const csv = await groupCsv(group.id);
    expect(csv.split("\n")[0]).toMatch(/^Estudiante,Correo,Nota estimada/);
    expect(csv.split("\n")).toHaveLength(3);
  });

  it("el docente puede apagar el tutor con avatar para su grupo", async () => {
    const { org } = await school({ seats: 2 });
    const group = await createGroup({ orgId: org.id, name: "G", exam: "IELTS_ACADEMIC" });
    const s = await join(org.id, "STUDENT", { groupId: group.id });
    const user = { id: s.user.id, role: "STUDENT" as const };
    expect((await can(user, "tutor.avatar")).allowed).toBe(true);
    await db.accessRule.create({ data: { scope: "GROUP", scopeId: group.id, resource: "tutor.avatar", allowed: false, reason: "Apagado por el docente." } });
    expect(await can(user, "tutor.avatar")).toMatchObject({ allowed: false, reason: "Apagado por el docente." });
  });
});
