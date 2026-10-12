/**
 * Writing IELTS: tarea con o sin reloj, borrador guardado, entrega con cupo reservado
 * y calificacion en el worker con dos calificaciones independientes de la IA (una
 * tercera si difieren en mas de una banda en algun criterio). El cupo se consume al
 * calificar y se devuelve si falla de nuestro lado.
 */
import { z } from "zod";

import { examSpec, partSpec } from "@/content/exams";
import type { ExamCode } from "@/content/exams/types";
import type { Prisma } from "@/generated/prisma/client";
import { can } from "@/server/access";
import { ai } from "@/server/ai";
import type { CurrentUser } from "@/server/auth/dal";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { enqueue } from "@/server/jobs/queue";
import { markPlanProgress } from "@/server/study/plan";

import { consumeQuota, releaseQuota, reserveQuota } from "./entitlements";
import { formItemSetIds } from "./forms";
import { productiveScale, type ScaleResult } from "./profiles";
import { GERMAN_RUBRIC_VERSION, criteriaFor, germanGradeSchema, germanGraderSystem, germanWritingPrompt } from "./scoring/german-graders";
import { countWords } from "./scoring/objective";
import { WRITING_GRADER_SYSTEM, WRITING_RUBRIC_VERSION, writingGradePrompt } from "./scoring/writing-rubric";

export class WritingError extends Error {
  constructor(
    readonly code: "NO_ACCESS" | "NO_CONTENT" | "NOT_FOUND" | "CLOSED" | "TOO_SHORT",
    message: string,
  ) {
    super(message);
    this.name = "WritingError";
  }
}

export const CRITERIA = ["TA", "CC", "LR", "GRA"] as const;
export type Criterion = (typeof CRITERIA)[number];

const CriterionScore = z.object({ band: z.number().int().min(0).max(9), commentEs: z.string().min(3) });
const GradeSchema = z.object({ criteria: z.object({ TA: CriterionScore, CC: CriterionScore, LR: CriterionScore, GRA: CriterionScore }) });
const FeedbackSchema = GradeSchema.extend({
  overviewEs: z.string().min(10),
  errors: z
    .array(
      z.object({
        quote: z.string().min(1),
        correction: z.string().min(1),
        explanationEs: z.string().min(3),
        type: z.enum(["grammar", "vocabulary", "spelling", "punctuation", "cohesion", "task"]),
      }),
    )
    .max(15),
  improvedVersion: z.string().min(50),
  nextStepsEs: z.array(z.string()).max(4),
});
type Grade = z.infer<typeof GradeSchema>;

export interface WritingFeedback {
  /** IELTS: TA/CC/LR/GRA en bandas 0–9 · aleman: criterios del examen de 0 a 5 */
  criteria: Record<string, { band: number; commentEs: string }>;
  /** nombres de los criterios (aleman) */
  criteriaLabels?: Record<string, string>;
  /** nota en la escala del examen (aleman: puntos Goethe o TDN) */
  scale?: ScaleResult;
  overviewEs: string;
  errors: z.infer<typeof FeedbackSchema>["errors"];
  improvedVersion: string;
  nextStepsEs: string[];
  modelAnswer: string;
  rubricVersion: string;
  graders: number;
}

export interface WritingConfig {
  section: "WRITING";
  part: number;
  itemSetIds: string[];
  timed: boolean;
  /** tarea de un simulacro completo (el cupo MOCK la cubre) */
  mockId?: string;
}

/** Tarea de Writing de un simulacro: bloque de la forma y reloj compartido. */
export async function createMockWriting(input: { userId: string; exam: ExamCode; task: number; itemSetId: string; deadlineAt: Date; mockId: string }) {
  const config: WritingConfig = { section: "WRITING", part: input.task, itemSetIds: [input.itemSetId], timed: true, mockId: input.mockId };
  return db.$transaction(async (tx) => {
    const a = await tx.examAttempt.create({
      data: { userId: input.userId, exam: input.exam, mode: "WRITING", config: config as unknown as Prisma.InputJsonValue },
    });
    await tx.examSectionAttempt.create({
      data: { attemptId: a.id, section: "WRITING", part: input.task, itemSetIds: [input.itemSetId], deadlineAt: input.deadlineAt },
    });
    await tx.itemExposure.upsert({
      where: { userId_itemSetId_mode: { userId: input.userId, itemSetId: input.itemSetId, mode: "MOCK" } },
      create: { userId: input.userId, itemSetId: input.itemSetId, mode: "MOCK" },
      update: { seenAt: new Date() },
    });
    return { attemptId: a.id };
  });
}

/* ───────────────────────── empezar y guardar ───────────────────────── */

export async function startWriting(user: Pick<CurrentUser, "id" | "role">, input: { exam: ExamCode; task: number; timed: boolean }) {
  const access = await can(user, "exam.writing");
  if (!access.allowed) throw new WritingError("NO_ACCESS", access.reason ?? "No tienes correcciones de Writing disponibles.");
  const [candidates, seen, forms] = await Promise.all([
    db.examItemSet.findMany({ where: { exam: input.exam, section: "WRITING", part: input.task, status: "APPROVED" }, select: { id: true } }),
    db.itemExposure.findMany({ where: { userId: user.id, itemSet: { exam: input.exam, section: "WRITING" } }, select: { itemSetId: true } }),
    db.examForm.findMany({ where: { exam: input.exam }, select: { blocks: true } }),
  ]);
  const seenIds = new Set(seen.map((s) => s.itemSetId));
  const reserved = new Set(forms.flatMap((f) => formItemSetIds(f.blocks)));
  const ranked = candidates
    .map((c) => ({ id: c.id, rank: (seenIds.has(c.id) ? 2 : 0) + (reserved.has(c.id) ? 1 : 0), r: Math.random() }))
    .sort((a, b) => a.rank - b.rank || a.r - b.r);
  if (!ranked.length) throw new WritingError("NO_CONTENT", "Todavía no hay tareas de Writing aprobadas.");
  const itemSetId = ranked[0].id;
  const spec = partSpec(input.exam, "WRITING", input.task);
  const config: WritingConfig = { section: "WRITING", part: input.task, itemSetIds: [itemSetId], timed: input.timed };

  return db.$transaction(async (tx) => {
    const a = await tx.examAttempt.create({
      data: { userId: user.id, exam: input.exam, mode: "WRITING", config: config as unknown as Prisma.InputJsonValue },
    });
    await tx.examSectionAttempt.create({
      data: {
        attemptId: a.id,
        section: "WRITING",
        part: input.task,
        itemSetIds: [itemSetId],
        deadlineAt: input.timed ? new Date(Date.now() + spec.minutes * 60_000) : null,
      },
    });
    await tx.itemExposure.upsert({
      where: { userId_itemSetId_mode: { userId: user.id, itemSetId, mode: "WRITING" } },
      create: { userId: user.id, itemSetId, mode: "WRITING" },
      update: { seenAt: new Date() },
    });
    return { attemptId: a.id };
  });
}

async function openAttempt(attemptId: string, userId: string) {
  const attempt = await db.examAttempt.findFirst({ where: { id: attemptId, userId, mode: "WRITING" }, include: { sections: true } });
  if (!attempt) throw new WritingError("NOT_FOUND", "No encontramos esa tarea.");
  return attempt;
}

export async function saveWritingDraft(attemptId: string, userId: string, text: string) {
  const attempt = await openAttempt(attemptId, userId);
  if (attempt.status !== "IN_PROGRESS") throw new WritingError("CLOSED", "Esta tarea ya se entregó.");
  const deadline = attempt.sections[0]?.deadlineAt;
  if (deadline && deadline.getTime() + 15_000 < Date.now()) throw new WritingError("CLOSED", "El tiempo terminó: se calificará lo último que guardaste.");
  const config = attempt.config as unknown as WritingConfig;
  const answer = { value: text.slice(0, 20_000) };
  await db.examResponse.upsert({
    where: { attemptId_itemSetId_questionId: { attemptId, itemSetId: config.itemSetIds[0], questionId: "text" } },
    create: { attemptId, itemSetId: config.itemSetIds[0], questionId: "text", answer },
    update: { answer, answeredAt: new Date() },
  });
}

/** Entrega: reserva el cupo y encola la calificacion. Idempotente. */
export async function submitWriting(attemptId: string, user: Pick<CurrentUser, "id" | "role">, text?: string) {
  const attempt = await openAttempt(attemptId, user.id);
  const existing = await db.writingSubmission.findFirst({ where: { attemptId } });
  if (existing) return existing;
  if (attempt.status !== "IN_PROGRESS") throw new WritingError("CLOSED", "Esta tarea ya se entregó.");
  if (text !== undefined) {
    try {
      await saveWritingDraft(attemptId, user.id, text);
    } catch (err) {
      // Pasado el tiempo se califica el ultimo borrador guardado.
      if (!(err instanceof WritingError && err.code === "CLOSED")) throw err;
    }
  }
  const config = attempt.config as unknown as WritingConfig;
  const draft = await db.examResponse.findUnique({
    where: { attemptId_itemSetId_questionId: { attemptId, itemSetId: config.itemSetIds[0], questionId: "text" } },
  });
  const body = String((draft?.answer as { value?: string } | undefined)?.value ?? "").trim();
  const words = countWords(body);
  // En un simulacro se califica lo que haya (aunque sea poco), como en el examen.
  if (words < 20 && !config.mockId) throw new WritingError("TOO_SHORT", "Escribe al menos 20 palabras para poder calificar tu texto.");

  // En un simulacro la correccion la cubre el cupo MOCK.
  const access = config.mockId ? { unlimited: true } : await can(user, "exam.writing");
  const submission = await db.writingSubmission.create({
    data: { attemptId, taskNumber: config.part, itemSetId: config.itemSetIds[0], text: body, words },
  });
  try {
    await reserveQuota({ userId: user.id, kind: "WRITING", refId: submission.id, unlimited: access.unlimited });
  } catch (err) {
    await db.writingSubmission.delete({ where: { id: submission.id } });
    throw err;
  }
  await db.examAttempt.update({ where: { id: attemptId }, data: { status: "SCORING" } });
  await db.examSectionAttempt.updateMany({ where: { attemptId }, data: { submittedAt: new Date() } });
  await enqueue("writing.grade", { submissionId: submission.id }, { dedupeKey: `writing:${submission.id}` });
  return submission;
}

/* ───────────────────────── calificar (worker) ───────────────────────── */

/** Banda de la tarea: promedio de los cuatro criterios, hacia abajo a media banda. */
export function taskBand(criteria: Record<Criterion, { band: number }>): number {
  const avg = CRITERIA.reduce((s, c) => s + criteria[c].band, 0) / CRITERIA.length;
  return Math.floor(avg * 2 + 1e-9) / 2;
}

/** Combina calificaciones: con dos, el promedio; con tres, la mediana por criterio. */
export function combineGrades(grades: Grade[]): Record<Criterion, number> {
  const out = {} as Record<Criterion, number>;
  for (const c of CRITERIA) {
    const v = grades.map((g) => g.criteria[c].band).sort((a, b) => a - b);
    out[c] = v.length >= 3 ? v[Math.floor(v.length / 2)] : v.reduce((a, b) => a + b, 0) / v.length;
  }
  return out;
}

export function gradersDisagree(a: Grade, b: Grade): boolean {
  return CRITERIA.some((c) => Math.abs(a.criteria[c].band - b.criteria[c].band) > 1);
}

export async function gradeWriting(submissionId: string, opts: { finalAttempt: boolean }) {
  const sub = await db.writingSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: { attempt: true } });
  if (sub.status === "GRADED") return { status: "GRADED", band: sub.finalScore };
  if (sub.attempt.exam !== "IELTS_ACADEMIC") return gradeWritingGerman(sub, opts);
  try {
    const item = await db.examItemSet.findUniqueOrThrow({ where: { id: sub.itemSetId } });
    const content = item.content as unknown as { prompt: string; chart?: unknown };
    const key = item.answerKey as unknown as { keyFeatures?: string[]; keyIdeas?: string[]; modelAnswer: string };
    const spec = partSpec(sub.attempt.exam, "WRITING", sub.taskNumber);
    const ctx = {
      task: sub.taskNumber as 1 | 2,
      prompt: content.prompt,
      minWords: spec.minWords ?? 0,
      chart: content.chart,
      examinerNotes: key.keyFeatures ?? key.keyIdeas ?? [],
      text: sub.text,
      words: sub.words,
    };
    const common = { modelKey: "ai.model.grade" as const, system: WRITING_GRADER_SYSTEM, userId: sub.attempt.userId, refId: submissionId };
    const [first, second] = await Promise.all([
      ai().generateJson({ ...common, purpose: "writing.grade", prompt: writingGradePrompt(ctx, true), schema: FeedbackSchema, temperature: 0.3 }),
      ai().generateJson({ ...common, purpose: "writing.grade", prompt: writingGradePrompt(ctx, false), schema: GradeSchema, temperature: 0.7 }),
    ]);
    const grades: Grade[] = [first.data, second.data];
    let cost = first.costMicroUsd + second.costMicroUsd;
    if (gradersDisagree(first.data, second.data)) {
      const third = await ai().generateJson({ ...common, purpose: "writing.grade", prompt: writingGradePrompt(ctx, false), schema: GradeSchema, temperature: 0.5 });
      grades.push(third.data);
      cost += third.costMicroUsd;
    }
    const combined = combineGrades(grades);
    const criteria = Object.fromEntries(CRITERIA.map((c) => [c, { band: combined[c], commentEs: first.data.criteria[c].commentEs }])) as WritingFeedback["criteria"];
    const band = taskBand(criteria);
    // Solo se marcan errores cuya cita aparece de verdad en el texto.
    const errors = first.data.errors.filter((e) => sub.text.includes(e.quote));
    const feedback: WritingFeedback = {
      criteria,
      overviewEs: first.data.overviewEs,
      errors,
      improvedVersion: first.data.improvedVersion,
      nextStepsEs: first.data.nextStepsEs,
      modelAnswer: key.modelAnswer,
      rubricVersion: WRITING_RUBRIC_VERSION,
      graders: grades.length,
    };
    await db.$transaction([
      db.writingSubmission.update({
        where: { id: submissionId },
        data: {
          status: "GRADED",
          grades: grades as unknown as Prisma.InputJsonValue,
          finalScore: band,
          feedback: feedback as unknown as Prisma.InputJsonValue,
          costMicroUsd: cost,
          gradedAt: new Date(),
        },
      }),
      db.examAttempt.update({
        where: { id: sub.attemptId },
        data: { status: "COMPLETED", completedAt: new Date(), overall: band, scores: { band, criteria: combined } as Prisma.InputJsonValue },
      }),
      db.examSectionAttempt.updateMany({ where: { attemptId: sub.attemptId }, data: { score: band } }),
    ]);
    await consumeQuota({ userId: sub.attempt.userId, kind: "WRITING", refId: submissionId });
    await updateWritingMastery(sub.attempt.userId, sub.attempt.exam, combined);
    await saveVocabulary(sub.attempt.userId, errors.filter((e) => e.type === "vocabulary" || e.type === "spelling"));
    if (!(sub.attempt.config as { mockId?: string }).mockId)
      await markPlanProgress(sub.attempt.userId, sub.attempt.exam, { kind: "WRITING", section: "WRITING" }).catch(() => undefined);
    return { status: "GRADED", band };
  } catch (err) {
    if (opts.finalAttempt) {
      // Falla de nuestro lado: se devuelve el cupo y se avisa.
      await releaseQuota({ userId: sub.attempt.userId, kind: "WRITING", refId: submissionId });
      await db.writingSubmission.update({ where: { id: submissionId }, data: { status: "FAILED" } });
      await db.examAttempt.update({ where: { id: sub.attemptId }, data: { status: "VOIDED" } });
    }
    throw err;
  }
}

/** Los errores de vocabulario del Writing entran a "Mi vocabulario" (repaso espaciado). */
async function saveVocabulary(userId: string, errors: { quote: string; correction: string; explanationEs: string }[]) {
  if (!errors.length) return;
  const profile = await db.languageProfile.findFirst({ where: { userId, language: { in: ["EN_GB", "EN_US"] } }, orderBy: { updatedAt: "desc" } });
  const language = profile?.language ?? "EN_GB";
  await db.vocabularyItem.createMany({
    data: errors
      .filter((e) => e.correction.split(/\s+/).length <= 4)
      .map((e) => ({
        userId,
        language,
        term: e.correction.slice(0, 80),
        termNormalized: e.correction.toLowerCase().trim().slice(0, 80),
        translationEs: e.explanationEs.slice(0, 200),
        example: `${e.quote} → ${e.correction}`.slice(0, 300),
        source: "WRITING",
      })),
    skipDuplicates: true,
  });
}

async function updateWritingMastery(userId: string, exam: ExamCode, criteria: Record<Criterion, number>) {
  for (const c of CRITERIA) {
    const key = `writing:${c}`;
    const prev = await db.skillMastery.findUnique({ where: { userId_exam_key: { userId, exam, key } } });
    const n = (prev?.n ?? 0) + 1;
    // Promedio movil: las tareas recientes pesan mas.
    const value = prev ? prev.value * 0.6 + criteria[c] * 0.4 : criteria[c];
    await db.skillMastery.upsert({
      where: { userId_exam_key: { userId, exam, key } },
      create: { userId, exam, key, value, se: 1, n },
      update: { value, se: Math.max(0.5, 1 / Math.sqrt(n)), n },
    });
  }
}

/* ───────────────────────── vista ───────────────────────── */

export async function loadWriting(attemptId: string, userId: string) {
  const attempt = await openAttempt(attemptId, userId);
  const config = attempt.config as unknown as WritingConfig;
  const item = await db.examItemSet.findUniqueOrThrow({ where: { id: config.itemSetIds[0] }, select: { id: true, part: true, content: true, topic: true } });
  const [draft, submission] = await Promise.all([
    db.examResponse.findUnique({ where: { attemptId_itemSetId_questionId: { attemptId, itemSetId: item.id, questionId: "text" } } }),
    db.writingSubmission.findFirst({ where: { attemptId } }),
  ]);
  const spec = partSpec(attempt.exam, "WRITING", config.part);
  return {
    attempt,
    config,
    task: item.content as unknown as { kind: string; prompt: string; chart?: unknown; essayType?: string; contentPoints?: string[] },
    sectionName: examSpec(attempt.exam).sections.find((x) => x.section === "WRITING")?.name ?? "Writing",
    partTitle: spec.title,
    minWords: spec.minWords ?? 0,
    minutes: spec.minutes,
    deadlineAt: attempt.sections[0]?.deadlineAt?.toISOString() ?? null,
    serverNow: new Date().toISOString(),
    draft: String((draft?.answer as { value?: string } | undefined)?.value ?? ""),
    submission: submission
      ? {
          status: submission.status,
          text: submission.text,
          words: submission.words,
          band: submission.finalScore,
          feedback: submission.feedback as unknown as WritingFeedback | null,
        }
      : null,
  };
}

/* ───────────────────────── aleman (Goethe, TestDaF) ───────────────────────── */

type Sub = Awaited<ReturnType<typeof db.writingSubmission.findUniqueOrThrow>> & { attempt: { id: string; userId: string; exam: ExamCode; config: unknown } };

async function gradeWritingGerman(sub: Sub, opts: { finalAttempt: boolean }) {
  try {
    const exam = sub.attempt.exam;
    const item = await db.examItemSet.findUniqueOrThrow({ where: { id: sub.itemSetId } });
    const content = item.content as unknown as { prompt: string; contentPoints?: string[]; chart?: unknown };
    const key = item.answerKey as unknown as { modelAnswer: string };
    const spec = partSpec(exam, "WRITING", sub.taskNumber);
    const criteria = criteriaFor(exam, "WRITING");
    const ctx = {
      examName: examSpec(exam).name,
      partTitle: spec.title,
      prompt: content.prompt,
      contentPoints: content.contentPoints ?? [],
      minWords: spec.minWords ?? 0,
      words: sub.words,
      chart: content.chart,
      text: sub.text,
    };
    const common = { modelKey: "ai.model.grade" as const, system: germanGraderSystem(exam, "WRITING"), userId: sub.attempt.userId, refId: sub.id, purpose: "writing.grade" as const };
    type G = { criteria: Record<string, { score: number; commentEs: string }> };
    type F = G & { overviewEs: string; errors: WritingFeedback["errors"]; improvedVersion: string; nextStepsEs: string[] };
    const [first, second] = await Promise.all([
      ai().generateJson({ ...common, prompt: germanWritingPrompt(ctx, true), schema: germanGradeSchema(exam, "WRITING", true) as unknown as z.ZodType<F>, temperature: 0.3 }),
      ai().generateJson({ ...common, prompt: germanWritingPrompt(ctx, false), schema: germanGradeSchema(exam, "WRITING", false) as unknown as z.ZodType<G>, temperature: 0.7 }),
    ]);
    const grades: G[] = [first.data, second.data];
    let cost = first.costMicroUsd + second.costMicroUsd;
    if (criteria.some((c) => Math.abs(first.data.criteria[c.key].score - second.data.criteria[c.key].score) > 1)) {
      const third = await ai().generateJson({ ...common, prompt: germanWritingPrompt(ctx, false), schema: germanGradeSchema(exam, "WRITING", false) as unknown as z.ZodType<G>, temperature: 0.5 });
      grades.push(third.data);
      cost += third.costMicroUsd;
    }
    const combined = Object.fromEntries(
      criteria.map((c) => {
        const v = grades.map((g) => g.criteria[c.key].score).sort((a, b) => a - b);
        return [c.key, v.length >= 3 ? v[1] : (v[0] + v[1]) / 2];
      }),
    ) as Record<string, number>;
    const scale = productiveScale(exam, Object.values(combined), (await getConfig())["exam.testdaf.cutoffs"]);
    const feedback: WritingFeedback = {
      criteria: Object.fromEntries(criteria.map((c) => [c.key, { band: combined[c.key], commentEs: first.data.criteria[c.key].commentEs }])),
      criteriaLabels: Object.fromEntries(criteria.map((c) => [c.key, `${c.labelEs} (${c.de})`])),
      scale,
      overviewEs: first.data.overviewEs,
      errors: first.data.errors.filter((e) => sub.text.includes(e.quote)),
      improvedVersion: first.data.improvedVersion,
      nextStepsEs: first.data.nextStepsEs,
      modelAnswer: key.modelAnswer,
      rubricVersion: GERMAN_RUBRIC_VERSION,
      graders: grades.length,
    };
    await db.$transaction([
      db.writingSubmission.update({
        where: { id: sub.id },
        data: { status: "GRADED", grades: grades as unknown as Prisma.InputJsonValue, finalScore: scale.value, feedback: feedback as unknown as Prisma.InputJsonValue, costMicroUsd: cost, gradedAt: new Date() },
      }),
      db.examAttempt.update({
        where: { id: sub.attemptId },
        data: { status: "COMPLETED", completedAt: new Date(), overall: scale.value, scores: { scale, criteria: combined } as unknown as Prisma.InputJsonValue },
      }),
      db.examSectionAttempt.updateMany({ where: { attemptId: sub.attemptId }, data: { score: scale.value } }),
    ]);
    await consumeQuota({ userId: sub.attempt.userId, kind: "WRITING", refId: sub.id });
    if (!(sub.attempt.config as { mockId?: string }).mockId)
      await markPlanProgress(sub.attempt.userId, exam, { kind: "WRITING", section: "WRITING" }).catch(() => undefined);
    return { status: "GRADED", band: scale.value };
  } catch (err) {
    if (opts.finalAttempt) {
      await releaseQuota({ userId: sub.attempt.userId, kind: "WRITING", refId: sub.id });
      await db.writingSubmission.update({ where: { id: sub.id }, data: { status: "FAILED" } });
      await db.examAttempt.update({ where: { id: sub.attemptId }, data: { status: "VOIDED" } });
    }
    throw err;
  }
}
