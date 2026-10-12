/**
 * Panel docente: grupos, asignaciones, semaforo, mapa de errores del grupo,
 * revision humana de Writing/Speaking y exportacion. Un docente solo ve a los
 * estudiantes de sus grupos; el administrador de la institucion ve todos.
 */
import { examSpec } from "@/content/exams";
import type { ExamCode, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { assembleForm, formItemSetIds } from "@/server/exams/forms";
import { estimateBands } from "@/server/study/plan";
import { overallOf } from "@/server/study/planner-core";

import { OrgError } from "./index";

/* ───────────────────────── permisos ───────────────────────── */

export async function memberFor(userId: string, orgId: string) {
  return db.orgMember.findFirst({ where: { userId, orgId, status: "ACTIVE" } });
}

/** Docente del grupo o administrador de su institucion (o administrador de MyPAL). */
export async function requireGroupAccess(user: { id: string; role: string }, groupId: string) {
  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group) throw new OrgError("NOT_FOUND", "No encontramos ese grupo.");
  if (user.role === "ADMIN") return { group, member: null };
  const member = await memberFor(user.id, group.orgId);
  if (!member) throw new OrgError("FORBIDDEN", "No tienes acceso a este grupo.");
  if (member.role === "ORG_ADMIN") return { group, member };
  const teaches = await db.groupTeacher.findUnique({ where: { groupId_memberId: { groupId, memberId: member.id } } });
  if (!teaches) throw new OrgError("FORBIDDEN", "No tienes acceso a este grupo.");
  return { group, member };
}

/** El docente puede ver a este estudiante (esta en alguno de sus grupos). */
export async function requireStudentAccess(user: { id: string; role: string }, studentMemberId: string) {
  const student = await db.orgMember.findUnique({ where: { id: studentMemberId }, include: { user: true, studying: true } });
  if (!student || student.status !== "ACTIVE") throw new OrgError("NOT_FOUND", "No encontramos a ese estudiante.");
  if (user.role === "ADMIN") return student;
  const me = await memberFor(user.id, student.orgId);
  if (!me) throw new OrgError("FORBIDDEN", "No tienes acceso a este estudiante.");
  if (me.role === "ORG_ADMIN") return student;
  const shared = await db.groupTeacher.findFirst({ where: { memberId: me.id, groupId: { in: student.studying.map((s) => s.groupId) } } });
  if (!shared) throw new OrgError("FORBIDDEN", "No tienes acceso a este estudiante.");
  return student;
}

export async function teacherGroups(userId: string) {
  const members = await db.orgMember.findMany({ where: { userId, status: "ACTIVE", role: { in: ["TEACHER", "ORG_ADMIN"] } }, include: { org: true } });
  const out = [];
  for (const m of members) {
    const groups = await db.group.findMany({
      where: m.role === "ORG_ADMIN" ? { orgId: m.orgId } : { orgId: m.orgId, teachers: { some: { memberId: m.id } } },
      include: { _count: { select: { students: true, assignments: true } } },
      orderBy: { createdAt: "desc" },
    });
    out.push({ member: m, org: m.org, groups });
  }
  return out;
}

/* ───────────────────────── grupos ───────────────────────── */

export async function createGroup(input: { orgId: string; name: string; exam: ExamCode; targetDate?: Date | null; targetScore?: number | null; teacherMemberId?: string }) {
  return db.group.create({
    data: {
      orgId: input.orgId,
      name: input.name,
      exam: input.exam,
      targetDate: input.targetDate ?? null,
      targetScore: input.targetScore ?? null,
      teachers: input.teacherMemberId ? { create: { memberId: input.teacherMemberId } } : undefined,
    },
  });
}

/** Nota estimada de una persona en el examen del grupo (IELTS: banda general; aleman: promedio de modulos). */
async function estimateFor(userId: string, exam: ExamCode): Promise<number | null> {
  if (exam === "IELTS_ACADEMIC") return overallOf(await estimateBands(userId, exam));
  const recent = await db.examAttempt.findMany({
    where: { userId, exam, status: "COMPLETED", overall: { not: null }, mode: { in: ["SECTION", "WRITING", "SPEAKING"] } },
    orderBy: { completedAt: "desc" },
    take: 4,
    select: { overall: true },
  });
  if (!recent.length) return null;
  return Math.round(recent.reduce((s, a) => s + (a.overall ?? 0), 0) / recent.length);
}

export type TrafficLight = "ON_TRACK" | "AT_RISK" | "INACTIVE" | "NO_DATA";

export async function groupOverview(groupId: string) {
  const group = await db.group.findUniqueOrThrow({
    where: { id: groupId },
    include: { org: true, students: { include: { member: { include: { user: true } } } }, assignments: { include: { results: true }, orderBy: { closesAt: "desc" } } },
  });
  const thresholds = group.org.thresholds as { riskBandGap?: number; inactiveDays?: number };
  const inactiveMs = (thresholds.inactiveDays ?? 7) * 86_400_000;
  const gap = thresholds.riskBandGap ?? (group.exam === "IELTS_ACADEMIC" ? 0.5 : 5);
  const target = group.targetScore;
  const spec = examSpec(group.exam);
  const taskTypes = [...new Set(spec.sections.filter((s) => s.section === "LISTENING" || s.section === "READING").flatMap((s) => s.parts.flatMap((p) => p.taskTypes)))];

  const students = await Promise.all(
    group.students.map(async ({ member }) => {
      const [estimate, last, mastery, mocks] = await Promise.all([
        estimateFor(member.userId, group.exam),
        db.examAttempt.findFirst({ where: { userId: member.userId, completedAt: { not: null } }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
        db.skillMastery.findMany({ where: { userId: member.userId, exam: group.exam } }),
        db.examAttempt.count({ where: { userId: member.userId, exam: group.exam, mode: "MOCK", status: "COMPLETED" } }),
      ]);
      const lastActivity = last?.completedAt ?? null;
      let status: TrafficLight = "NO_DATA";
      if (!lastActivity || Date.now() - lastActivity.getTime() > inactiveMs) status = "INACTIVE";
      else if (estimate !== null && target !== null) status = estimate + 1e-9 >= target - gap ? "ON_TRACK" : "AT_RISK";
      else if (estimate !== null) status = "ON_TRACK";
      return {
        memberId: member.id,
        name: member.user.name,
        email: member.user.email,
        isMinor: member.isMinor,
        estimate,
        lastActivity,
        mocks,
        status,
        mastery: Object.fromEntries(mastery.map((m) => [m.key, { value: m.value, n: m.n }])),
      };
    }),
  );
  const now = Date.now();
  const active7 = students.filter((s) => s.lastActivity && now - s.lastActivity.getTime() < 7 * 86_400_000).length;
  const estimates = students.map((s) => s.estimate).filter((x): x is number => x !== null);
  const results = group.assignments.flatMap((a) => (a.opensAt.getTime() <= now ? a.results : []));
  // Mapa: tasa de error por tipo de pregunta y estudiante (null = sin datos).
  const heatmap = taskTypes.map((t) => ({
    taskType: t,
    cells: students.map((s) => {
      const m = s.mastery[`task:${t}`];
      return m && m.n >= 3 ? 1 - m.value : null;
    }),
  }));
  return {
    group,
    students,
    heatmap: heatmap.filter((r) => r.cells.some((c) => c !== null)).sort((a, b) => avg(b.cells) - avg(a.cells)),
    kpis: {
      students: students.length,
      active7,
      averageEstimate: estimates.length ? estimates.reduce((a, b) => a + b, 0) / estimates.length : null,
      onTrack: students.filter((s) => s.status === "ON_TRACK").length,
      atRisk: students.filter((s) => s.status === "AT_RISK").length,
      assignmentCompletion: results.length ? results.filter((r) => r.status === "DONE").length / results.length : null,
    },
  };
}

function avg(cells: (number | null)[]) {
  const v = cells.filter((c): c is number => c !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

/* ───────────────────────── asignaciones ───────────────────────── */

export type AssignmentKind = "PRACTICE" | "WRITING" | "SPEAKING" | "MOCK";

/** Forma que ningun estudiante del grupo ha visto (simulacro institucional). */
async function reserveGroupForm(groupId: string, exam: ExamCode): Promise<string> {
  const students = await db.groupStudent.findMany({ where: { groupId }, include: { member: { select: { userId: true } } } });
  const seen = new Set(
    (await db.itemExposure.findMany({ where: { userId: { in: students.map((s) => s.member.userId) }, itemSet: { exam } }, select: { itemSetId: true } })).map((e) => e.itemSetId),
  );
  const reserved = new Set((await db.assignment.findMany({ where: { formId: { not: null } }, select: { formId: true } })).map((a) => a.formId));
  const forms = await db.examForm.findMany({ where: { exam, status: "APPROVED" }, orderBy: { version: "asc" } });
  const fresh = forms.find((f) => !reserved.has(f.id) && formItemSetIds(f.blocks).every((id) => !seen.has(id)));
  if (fresh) return fresh.id;
  const made = await assembleForm(exam);
  if (made.ok) return made.formId;
  throw new OrgError("INVALID", "No hay una forma de simulacro nueva para este grupo. Pide al equipo de MyPAL que genere más material.");
}

export async function createAssignment(input: {
  groupId: string;
  createdBy: string;
  kind: AssignmentKind;
  title: string;
  config: Record<string, unknown>;
  opensAt: Date;
  closesAt: Date;
}) {
  if (input.closesAt <= input.opensAt) throw new OrgError("INVALID", "La fecha de cierre debe ser posterior a la de apertura.");
  const group = await db.group.findUniqueOrThrow({ where: { id: input.groupId }, include: { students: true } });
  const formId = input.kind === "MOCK" ? await reserveGroupForm(group.id, group.exam) : null;
  const a = await db.assignment.create({
    data: {
      groupId: group.id,
      createdBy: input.createdBy,
      kind: input.kind,
      title: input.title,
      config: { ...input.config, exam: group.exam } as Prisma.InputJsonValue,
      opensAt: input.opensAt,
      closesAt: input.closesAt,
      formId,
      results: { create: group.students.map((s) => ({ memberId: s.memberId })) },
    },
  });
  // La tarea entra al plan de estudios de cada estudiante que tenga plan activo.
  const students = await db.orgMember.findMany({ where: { id: { in: group.students.map((s) => s.memberId) } }, select: { userId: true } });
  for (const s of students) {
    const plan = await db.studyPlan.findFirst({ where: { userId: s.userId, exam: group.exam, status: "ACTIVE" } });
    if (!plan) continue;
    const weekStart = new Date(Date.UTC(input.closesAt.getUTCFullYear(), input.closesAt.getUTCMonth(), input.closesAt.getUTCDate()));
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
    const cfg = input.config as { mode?: string; section?: string; taskType?: string; part?: number; task?: number };
    await db.studyPlanItem.create({
      data: {
        planId: plan.id,
        weekStart,
        dueDate: input.closesAt,
        kind: input.kind === "PRACTICE" ? (cfg.mode ?? "DRILL") : input.kind,
        section: (cfg.section as never) ?? null,
        taskType: cfg.taskType ?? null,
        part: cfg.part ?? cfg.task ?? null,
        minutes: input.kind === "MOCK" ? 165 : 30,
        title: `Tarea del docente: ${input.title}`,
        origin: "ASSIGNMENT",
        sourceAttemptId: a.id,
      },
    });
  }
  return a;
}

/** Tareas abiertas de una persona (como estudiante). */
export async function studentAssignments(userId: string) {
  const memberships = await db.orgMember.findMany({ where: { userId, status: "ACTIVE", role: "STUDENT" }, select: { id: true } });
  if (!memberships.length) return [];
  const now = new Date();
  return db.assignmentResult.findMany({
    where: { memberId: { in: memberships.map((m) => m.id) }, assignment: { opensAt: { lte: now } } },
    include: { assignment: { include: { group: { select: { name: true } } } } },
    orderBy: { assignment: { closesAt: "asc" } },
    take: 20,
  });
}

/** Marca la tarea como cumplida cuando termina el intento que la cumple. */
export async function completeAssignmentFor(attemptId: string) {
  const attempt = await db.examAttempt.findUnique({ where: { id: attemptId }, select: { assignmentId: true, userId: true } });
  if (!attempt?.assignmentId) return;
  const members = await db.orgMember.findMany({ where: { userId: attempt.userId, status: "ACTIVE" }, select: { id: true } });
  await db.assignmentResult.updateMany({
    where: { assignmentId: attempt.assignmentId, memberId: { in: members.map((m) => m.id) }, status: "PENDING" },
    data: { status: "DONE", attemptId, completedAt: new Date() },
  });
}

/** Valida que la persona puede empezar esta tarea y devuelve su configuracion. */
export async function assignmentForStudent(assignmentId: string, userId: string) {
  const members = await db.orgMember.findMany({ where: { userId, status: "ACTIVE" }, select: { id: true } });
  const result = await db.assignmentResult.findFirst({
    where: { assignmentId, memberId: { in: members.map((m) => m.id) } },
    include: { assignment: true },
  });
  if (!result) throw new OrgError("NOT_FOUND", "No encontramos esa tarea.");
  if (result.assignment.opensAt > new Date()) throw new OrgError("INVALID", "Esta tarea todavía no está abierta.");
  return result.assignment;
}

/* ───────────────────────── revision humana ───────────────────────── */

export async function pendingReviews(groupId: string) {
  const students = await db.groupStudent.findMany({ where: { groupId }, include: { member: { include: { user: { select: { id: true, name: true } } } } } });
  const userIds = students.map((s) => s.member.user.id);
  const name = (uid: string) => students.find((s) => s.member.user.id === uid)?.member.user.name ?? "";
  const [writing, speaking] = await Promise.all([
    db.writingSubmission.findMany({ where: { status: "GRADED", attempt: { userId: { in: userIds } } }, include: { attempt: { select: { userId: true, exam: true } } }, orderBy: { gradedAt: "desc" }, take: 40 }),
    db.speakingSubmission.findMany({ where: { status: "GRADED", attempt: { userId: { in: userIds } } }, include: { attempt: { select: { userId: true, exam: true } } }, orderBy: { gradedAt: "desc" }, take: 40 }),
  ]);
  const reviewed = new Set((await db.teacherReview.findMany({ where: { submissionId: { in: [...writing, ...speaking].map((x) => x.id) } }, select: { submissionId: true } })).map((r) => r.submissionId));
  return [
    ...writing.filter((w) => !reviewed.has(w.id)).map((w) => ({ kind: "WRITING" as const, id: w.id, part: w.taskNumber, student: name(w.attempt.userId), aiScore: w.finalScore, at: w.gradedAt })),
    ...speaking.filter((s) => !reviewed.has(s.id)).map((s) => ({ kind: "SPEAKING" as const, id: s.id, part: s.part, student: name(s.attempt.userId), aiScore: s.finalScore, at: s.gradedAt })),
  ];
}

export async function addTeacherReview(user: { id: string; role: string }, input: { kind: "WRITING" | "SPEAKING"; submissionId: string; score: number; reason: string; comment?: string }) {
  const sub =
    input.kind === "WRITING"
      ? await db.writingSubmission.findUnique({ where: { id: input.submissionId }, include: { attempt: true } })
      : await db.speakingSubmission.findUnique({ where: { id: input.submissionId }, include: { attempt: true } });
  if (!sub) throw new OrgError("NOT_FOUND", "No encontramos esa entrega.");
  const studentMember = await db.orgMember.findFirst({ where: { userId: sub.attempt.userId, status: "ACTIVE", role: "STUDENT" } });
  if (!studentMember) throw new OrgError("FORBIDDEN", "Esa persona no es estudiante de tu institución.");
  await requireStudentAccess(user, studentMember.id);
  const reviewer = user.role === "ADMIN" ? null : await memberFor(user.id, studentMember.orgId);
  return db.teacherReview.create({
    data: {
      kind: input.kind,
      submissionId: input.submissionId,
      reviewerMemberId: reviewer?.id ?? `admin:${user.id}`,
      aiScore: sub.finalScore,
      score: input.score,
      reason: input.reason,
      comment: input.comment ?? null,
    },
  });
}

/** Nota vigente del docente para una entrega (la mas reciente). */
export async function latestTeacherReview(submissionId: string) {
  return db.teacherReview.findFirst({ where: { submissionId }, orderBy: { createdAt: "desc" } });
}

/* ───────────────────────── exportar ───────────────────────── */

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Evita formulas en hojas de calculo (=, +, -, @) y escapa comillas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function groupCsv(groupId: string): Promise<string> {
  const { group, students } = await groupOverview(groupId);
  const assignments = await db.assignment.findMany({ where: { groupId }, include: { results: true } });
  const header = ["Estudiante", "Correo", "Nota estimada", "Meta", "Estado", "Última actividad", "Simulacros", "Tareas cumplidas", "Tareas asignadas"];
  const rows = students.map((s) => {
    const mine = assignments.flatMap((a) => a.results.filter((r) => r.memberId === s.memberId));
    return [
      s.name,
      s.email,
      s.estimate ?? "",
      group.targetScore ?? "",
      { ON_TRACK: "En meta", AT_RISK: "En riesgo", INACTIVE: "Inactivo", NO_DATA: "Sin datos" }[s.status],
      s.lastActivity ? s.lastActivity.toISOString().slice(0, 10) : "",
      s.mocks,
      mine.filter((r) => r.status === "DONE").length,
      mine.length,
    ];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

/** Resumen diario de cada grupo (tendencia del panel). */
export async function snapshotGroups(): Promise<number> {
  const groups = await db.group.findMany({ select: { id: true } });
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  for (const g of groups) {
    const { kpis } = await groupOverview(g.id);
    await db.groupStatsSnapshot.upsert({
      where: { groupId_day: { groupId: g.id, day } },
      create: { groupId: g.id, day, data: kpis as unknown as Prisma.InputJsonValue },
      update: { data: kpis as unknown as Prisma.InputJsonValue },
    });
  }
  return groups.length;
}

/** Fechas por defecto del formulario de tareas: abre ahora y cierra en 7 dias (hora local del servidor). */
export function assignmentDefaults() {
  const now = new Date();
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return { now, opensAt: local(now), closesAt: local(new Date(now.getTime() + 7 * 86_400_000)) };
}
