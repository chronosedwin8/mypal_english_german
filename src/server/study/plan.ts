/**
 * Plan de estudios y seguimiento: estimacion de bandas actuales, creacion y recalculo
 * del plan, avance automatico al practicar y plan de mejora despues de cada simulacro.
 */
import { examSpec } from "@/content/exams";
import { IELTS_LISTENING_TABLE, IELTS_READING_ACADEMIC_TABLE, ieltsWritingBand, proportionalBand } from "@/content/exams/scales";
import type { ExamCode } from "@/content/exams/types";
import type { ExamSection } from "@/generated/prisma/client";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { quotaSummary } from "@/server/exams/entitlements";
import { getBalance } from "@/server/ledger/wallet";

import { STUDY_SECTIONS, buildPlan, overallOf, weekStartOf, type ItemKind, type StudySection } from "./planner-core";

export interface PlanTargets {
  overall: number;
  sections?: Partial<Record<StudySection, number>>;
}

/* ───────────────────────── estimacion actual ───────────────────────── */

/** Banda estimada por seccion con lo que la persona ya hizo (null = sin datos). */
export async function estimateBands(userId: string, exam: ExamCode): Promise<Record<StudySection, number | null>> {
  const [sections, mastery, writing, speaking] = await Promise.all([
    db.examAttempt.findMany({
      where: { userId, exam, mode: "SECTION", status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 10,
      select: { config: true, scores: true },
    }),
    db.skillMastery.findMany({ where: { userId, exam, key: { in: ["section:LISTENING", "section:READING"] } } }),
    db.writingSubmission.findMany({
      where: { attempt: { userId, exam }, status: "GRADED" },
      orderBy: { gradedAt: "desc" },
      take: 6,
      select: { taskNumber: true, finalScore: true },
    }),
    db.examAttempt.findFirst({ where: { userId, exam, mode: "SPEAKING", status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: { overall: true } }),
  ]);
  const objective = (section: "LISTENING" | "READING") => {
    const full = sections.find((a) => (a.config as { section?: string }).section === section && (a.scores as { total?: number })?.total === 40);
    if (full) return (full.scores as { band: number | null }).band;
    const m = mastery.find((x) => x.key === `section:${section}`);
    if (m && m.n >= 10) return proportionalBand(m.value * 40, 40, section === "LISTENING" ? IELTS_LISTENING_TABLE : IELTS_READING_ACADEMIC_TABLE);
    return null;
  };
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const t1 = avg(writing.filter((w) => w.taskNumber === 1 && w.finalScore !== null).slice(0, 3).map((w) => w.finalScore!));
  const t2 = avg(writing.filter((w) => w.taskNumber === 2 && w.finalScore !== null).slice(0, 3).map((w) => w.finalScore!));
  const writingBand = t1 !== null && t2 !== null ? ieltsWritingBand(t1, t2, (await getConfig())["exam.writing.task2Weight"]) : (t2 ?? t1);
  return {
    LISTENING: objective("LISTENING"),
    READING: objective("READING"),
    WRITING: writingBand !== null ? Math.floor(writingBand * 2) / 2 : null,
    SPEAKING: speaking?.overall ?? null,
  };
}

/* ───────────────────────── crear y recalcular ───────────────────────── */

async function planInputs(userId: string, exam: ExamCode, role: string) {
  const cfg = await getConfig();
  const [current, mastery, quota, balance] = await Promise.all([
    estimateBands(userId, exam),
    db.skillMastery.findMany({ where: { userId, exam, key: { startsWith: "task:" } } }),
    quotaSummary(userId),
    getBalance(userId).catch(() => null),
  ]);
  const spec = examSpec(exam);
  const typesOf = (section: "LISTENING" | "READING"): string[] => [...new Set(spec.sections.find((s) => s.section === section)?.parts.flatMap((p) => p.taskTypes) ?? [])];
  const sectionOfType = (t: string): "LISTENING" | "READING" => (typesOf("READING").includes(t) && !typesOf("LISTENING").includes(t) ? "READING" : "LISTENING");
  return {
    current,
    taskMastery: mastery.map((m) => {
      const taskType = m.key.slice(5);
      return { section: sectionOfType(taskType), taskType, value: m.value, n: m.n };
    }),
    taskTypes: { LISTENING: typesOf("LISTENING"), READING: typesOf("READING") },
    mocksAvailable: role === "ADMIN" ? 99 : quota.MOCK.available,
    hasTutorMinutes: (balance?.paidAvailableSeconds ?? 0) >= 600,
    hoursPerBand: cfg["study.hoursPerBand"],
    defaultWeeks: cfg["study.defaultWeeks"],
  };
}

export interface PlanSettings {
  exam: ExamCode;
  targets: PlanTargets;
  examDate: Date | null;
  hoursPerWeek: number;
  days: number[];
}

export async function savePlan(user: { id: string; role: string }, settings: PlanSettings) {
  const existing = await db.studyPlan.findFirst({ where: { userId: user.id, exam: settings.exam, status: "ACTIVE" } });
  const plan = existing
    ? await db.studyPlan.update({
        where: { id: existing.id },
        data: { targets: settings.targets as never, examDate: settings.examDate, hoursPerWeek: settings.hoursPerWeek, days: settings.days },
      })
    : await db.studyPlan.create({
        data: { userId: user.id, exam: settings.exam, targets: settings.targets as never, examDate: settings.examDate, hoursPerWeek: settings.hoursPerWeek, days: settings.days },
      });
  await replanStudy(plan.id);
  return plan;
}

/**
 * Rehace las tareas pendientes desde esta semana con el dominio actual. Conserva lo
 * hecho y las tareas del plan de mejora (origen MOCK).
 */
export async function replanStudy(planId: string) {
  const plan = await db.studyPlan.findUniqueOrThrow({ where: { id: planId }, include: { user: { select: { role: true } } } });
  const targets = plan.targets as unknown as PlanTargets;
  const inputs = await planInputs(plan.userId, plan.exam, plan.user.role);
  const result = buildPlan({
    today: new Date(),
    examDate: plan.examDate,
    hoursPerWeek: plan.hoursPerWeek,
    days: plan.days,
    target: targets.overall,
    sectionTargets: targets.sections,
    ...inputs,
  });
  const fromWeek = weekStartOf(new Date());
  await db.$transaction([
    db.studyPlanItem.deleteMany({ where: { planId, status: "TODO", origin: "INITIAL", weekStart: { gte: fromWeek } } }),
    db.studyPlanItem.createMany({
      data: result.items.map((i) => ({
        planId,
        weekStart: i.weekStart,
        dueDate: i.dueDate,
        kind: i.kind,
        section: i.section as ExamSection | null,
        taskType: i.taskType,
        part: i.part,
        minutes: i.minutes,
        title: i.title,
      })),
    }),
    db.studyPlan.update({ where: { id: planId }, data: { updatedAt: new Date() } }),
  ]);
  return result;
}

/** El worker recalcula cada noche los planes activos. */
export async function replanAll(): Promise<number> {
  const stale = await db.studyPlan.findMany({ where: { status: "ACTIVE", updatedAt: { lt: new Date(Date.now() - 20 * 3_600_000) } }, select: { id: true }, take: 200 });
  for (const p of stale) await replanStudy(p.id).catch((err) => console.error("[study] replan", p.id, err));
  return stale.length;
}

/* ───────────────────────── avance ───────────────────────── */

export interface Activity {
  kind: ItemKind;
  section?: StudySection | null;
  taskType?: string | null;
}

/** Marca como hecha la tarea pendiente mas antigua que coincide con lo que se acaba de hacer. */
export async function markPlanProgress(userId: string, exam: ExamCode, activity: Activity) {
  const plan = await db.studyPlan.findFirst({ where: { userId, exam, status: "ACTIVE" }, select: { id: true } });
  if (!plan) return;
  const nextWeek = new Date(weekStartOf(new Date()).getTime() + 7 * 86_400_000);
  const candidates = await db.studyPlanItem.findMany({
    where: {
      planId: plan.id,
      status: "TODO",
      kind: activity.kind,
      weekStart: { lt: nextWeek },
      ...(activity.section ? { section: activity.section } : {}),
    },
    orderBy: [{ weekStart: "asc" }, { dueDate: "asc" }],
  });
  const match = candidates.find((c) => !c.taskType || !activity.taskType || c.taskType === activity.taskType) ?? null;
  if (match) await db.studyPlanItem.update({ where: { id: match.id }, data: { status: "DONE" } });
}

export async function setItemStatus(itemId: string, userId: string, status: "TODO" | "DONE" | "SKIPPED") {
  await db.studyPlanItem.updateMany({ where: { id: itemId, plan: { userId } }, data: { status } });
}

/** Plan de mejora despues de un simulacro: 3–6 tareas con origen MOCK en las dos semanas siguientes. */
export async function addMockImprovements(mockId: string) {
  const mock = await db.examAttempt.findUnique({ where: { id: mockId }, include: { report: true } });
  if (!mock?.report) return;
  const plan = await db.studyPlan.findFirst({ where: { userId: mock.userId, exam: mock.exam, status: "ACTIVE" } });
  if (!plan) return;
  if (await db.studyPlanItem.count({ where: { planId: plan.id, sourceAttemptId: mockId } })) return;
  const weaknesses = (mock.report.weaknesses as { key: string; correct: number; total: number }[]).slice(0, 3);
  const targets = plan.targets as unknown as PlanTargets;
  const scores = mock.scores as { writing?: { band: number } | null; speaking?: { band: number } | null } | null;
  const start = new Date(weekStartOf(new Date()).getTime() + 7 * 86_400_000);
  const items: { kind: ItemKind; section: StudySection | null; taskType: string | null; part: number | null; minutes: number; title: string }[] = [];
  for (const w of weaknesses) {
    const [section, taskType] = w.key.split(":") as [StudySection, string];
    for (let i = 0; i < 3; i++) items.push({ kind: "DRILL", section, taskType, part: null, minutes: 15, title: `Plan de mejora: ${taskType.replaceAll("_", " ").toLowerCase()} (${w.correct}/${w.total} en el simulacro)` });
  }
  if (scores?.writing && scores.writing.band < targets.overall)
    items.push({ kind: "WRITING", section: "WRITING", taskType: null, part: 2, minutes: 50, title: "Plan de mejora: Writing Task 2 con reescritura" });
  if (scores?.speaking && scores.speaking.band < targets.overall)
    items.push({ kind: "SPEAKING", section: "SPEAKING", taskType: null, part: 3, minutes: 15, title: "Plan de mejora: Speaking Part 3, respuestas largas" });
  await db.studyPlanItem.createMany({
    data: items.slice(0, 12).map((it, i) => {
      const weekStart = new Date(start.getTime() + (i % 2) * 7 * 86_400_000);
      return {
        planId: plan.id,
        weekStart,
        dueDate: new Date(weekStart.getTime() + ((i % 5) + 1) * 86_400_000),
        kind: it.kind,
        section: it.section as ExamSection | null,
        taskType: it.taskType,
        part: it.part,
        minutes: it.minutes,
        title: it.title,
        origin: "MOCK",
        sourceAttemptId: mockId,
      };
    }),
  });
  await replanStudy(plan.id);
}

/* ───────────────────────── vistas ───────────────────────── */

export async function planView(userId: string, exam: ExamCode) {
  const plan = await db.studyPlan.findFirst({ where: { userId, exam, status: "ACTIVE" }, include: { items: { orderBy: [{ weekStart: "asc" }, { dueDate: "asc" }] } } });
  if (!plan) return null;
  const current = await estimateBands(userId, exam);
  const thisWeek = weekStartOf(new Date()).getTime();
  const targets = plan.targets as unknown as PlanTargets;
  const cfg = await getConfig();
  const projection = buildPlan({
    today: new Date(),
    examDate: plan.examDate,
    hoursPerWeek: plan.hoursPerWeek,
    days: plan.days,
    target: targets.overall,
    current,
    taskMastery: [],
    taskTypes: { LISTENING: [], READING: [] },
    mocksAvailable: 0,
    hasTutorMinutes: false,
    hoursPerBand: cfg["study.hoursPerBand"],
    defaultWeeks: cfg["study.defaultWeeks"],
  });
  return {
    plan,
    targets,
    current,
    currentOverall: overallOf(current),
    projectedOverall: projection.projectedOverall,
    warning: projection.warning,
    daysLeft: plan.examDate ? Math.ceil((plan.examDate.getTime() - Date.now()) / 86_400_000) : null,
    thisWeek: plan.items.filter((i) => i.weekStart.getTime() === thisWeek),
    upcoming: plan.items.filter((i) => i.weekStart.getTime() > thisWeek),
    overdue: plan.items.filter((i) => i.weekStart.getTime() < thisWeek && i.status === "TODO"),
  };
}

/** Datos de la pagina de progreso. */
export async function progressData(userId: string, exam: ExamCode) {
  const [attempts, mastery, plan, official] = await Promise.all([
    db.examAttempt.findMany({
      where: { userId, exam, status: "COMPLETED" },
      orderBy: { completedAt: "asc" },
      select: { id: true, mode: true, config: true, scores: true, overall: true, completedAt: true },
    }),
    db.skillMastery.findMany({ where: { userId, exam }, orderBy: { key: "asc" } }),
    db.studyPlan.findFirst({ where: { userId, exam, status: "ACTIVE" }, include: { items: true } }),
    db.officialResult.findMany({ where: { userId, exam }, orderBy: { takenAt: "desc" } }),
  ]);
  const points: { date: string; section: StudySection | "OVERALL"; band: number }[] = [];
  for (const a of attempts) {
    const date = a.completedAt!.toISOString();
    const cfg = a.config as { section?: StudySection; mockId?: string };
    if (a.mode === "MOCK" && a.overall !== null) points.push({ date, section: "OVERALL", band: a.overall });
    else if (a.mode === "SECTION" && (a.scores as { total?: number; band?: number | null })?.total === 40 && (a.scores as { band: number | null }).band !== null)
      points.push({ date, section: cfg.section!, band: (a.scores as { band: number }).band });
    else if ((a.mode === "WRITING" || a.mode === "SPEAKING") && a.overall !== null) points.push({ date, section: a.mode, band: a.overall });
  }
  // Racha: dias seguidos (hasta hoy o ayer) con alguna practica terminada.
  const days = new Set(attempts.map((a) => a.completedAt!.toISOString().slice(0, 10)));
  let streak = 0;
  const d = new Date();
  if (!days.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  const now = Date.now();
  const due = plan?.items.filter((i) => i.weekStart.getTime() <= now) ?? [];
  const objectiveIds = attempts.filter((a) => a.mode === "DRILL" || a.mode === "PART" || a.mode === "SECTION").map((a) => a.id);
  const [answered, blank] = await Promise.all([
    db.examResponse.count({ where: { attemptId: { in: objectiveIds } } }),
    db.examResponse.count({ where: { attemptId: { in: objectiveIds }, answer: { equals: { value: "" } } } }),
  ]);
  return {
    points,
    mastery,
    mocks: attempts.filter((a) => a.mode === "MOCK").reverse(),
    streak,
    plannedMinutes: due.reduce((s, i) => s + i.minutes, 0),
    doneMinutes: due.filter((i) => i.status === "DONE").reduce((s, i) => s + i.minutes, 0),
    unansweredRate: answered ? blank / answered : 0,
    official,
    target: (plan?.targets as unknown as PlanTargets | undefined)?.overall ?? null,
  };
}

/** Contexto para el tutor: si prepara IELTS, en que enfocarse. */
export async function tutorExamFocus(userId: string): Promise<string | null> {
  const plan = await db.studyPlan.findFirst({ where: { userId, exam: "IELTS_ACADEMIC", status: "ACTIVE" } });
  if (!plan) return null;
  const targets = plan.targets as unknown as PlanTargets;
  const crit = await db.skillMastery.findMany({ where: { userId, exam: "IELTS_ACADEMIC", key: { startsWith: "speaking:" } }, orderBy: { value: "asc" }, take: 2 });
  const names: Record<string, string> = { FC: "fluency and coherence", LR: "vocabulary range", GRA: "grammar accuracy", P: "pronunciation" };
  const weak = crit.map((c) => names[c.key.split(":")[1]] ?? c.key).join(" and ");
  return `The student is preparing for IELTS Academic (target band ${targets.overall.toFixed(1)}). When natural, include IELTS Speaking-style questions and ask for extended answers with reasons and examples (Part 3 style).${weak ? ` Focus especially on ${weak}.` : ""}`;
}

export { STUDY_SECTIONS };
