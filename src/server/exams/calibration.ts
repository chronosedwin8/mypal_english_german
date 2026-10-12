import { EXAM_CODES } from "@/content/exams";
import { IELTS_LISTENING_TABLE, IELTS_READING_ACADEMIC_TABLE } from "@/content/exams/scales";
import type { ExamCode, ExamSectionCode } from "@/content/exams/types";
import type { Prisma } from "@/generated/prisma/client";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";

import { equateTable, isDefective, pointBiserial, rasch, type Observation } from "./calibration-core";
import type { FormBlocks } from "./forms";

export interface CalibrationSummary {
  exam: ExamCode;
  attempts: number;
  questions: number;
  calibrated: number;
  defective: number;
  sentToReview: number;
  formsCalibrated: number;
}

export type FormConversion = Partial<Record<ExamSectionCode, [number, number][]>>;

/** Calibracion diaria de todos los examenes. */
export async function calibrateBank(): Promise<CalibrationSummary[]> {
  const out: CalibrationSummary[] = [];
  for (const exam of EXAM_CODES) out.push(await calibrateExam(exam));
  return out;
}

export async function calibrateExam(exam: ExamCode): Promise<CalibrationSummary> {
  const cfg = await getConfig();
  const opts = {
    minResponses: cfg["exam.calibration.minResponses"],
    minDiscrimination: cfg["exam.calibration.minDiscrimination"],
    minPCorrect: cfg["exam.calibration.minPCorrect"],
  };
  const rows = await db.$queryRaw<{ attemptId: string; itemSetId: string; questionId: string; isCorrect: boolean }[]>`
    SELECT r."attemptId", r."itemSetId", r."questionId", r."isCorrect"
    FROM "ExamResponse" r JOIN "ExamAttempt" a ON a.id = r."attemptId"
    WHERE a.exam = ${exam}::"ExamCode" AND a.status = 'COMPLETED' AND r."isCorrect" IS NOT NULL`;
  const summary: CalibrationSummary = { exam, attempts: 0, questions: 0, calibrated: 0, defective: 0, sentToReview: 0, formsCalibrated: 0 };
  if (!rows.length) return summary;

  const obs: Observation[] = rows.map((r) => ({ person: r.attemptId, item: `${r.itemSetId}#${r.questionId}`, correct: r.isCorrect }));
  const { difficulty } = rasch(obs);
  const disc = pointBiserial(obs);
  const counts = new Map<string, { n: number; c: number }>();
  for (const o of obs) {
    const k = counts.get(o.item) ?? { n: 0, c: 0 };
    k.n++;
    if (o.correct) k.c++;
    counts.set(o.item, k);
  }
  summary.attempts = new Set(rows.map((r) => r.attemptId)).size;

  const stats = [...counts].map(([item, k]) => {
    const [itemSetId, questionId] = item.split("#");
    const check = { n: k.n, pCorrect: k.c / k.n, discrimination: disc.get(item) ?? null };
    return {
      itemSetId,
      questionId,
      exam,
      n: k.n,
      pCorrect: check.pCorrect,
      difficulty: difficulty.get(item) ?? 0,
      discrimination: check.discrimination,
      flag: isDefective(check, opts) ? "DEFECTIVE" : null,
    };
  });
  summary.questions = stats.length;
  summary.calibrated = stats.filter((s) => s.n >= opts.minResponses).length;
  summary.defective = stats.filter((s) => s.flag).length;

  await db.$transaction([db.examItemStat.deleteMany({ where: { exam } }), db.examItemStat.createMany({ data: stats })]);

  // Bloques con preguntas defectuosas: salen de circulacion hasta que un humano los revise.
  const defective = stats.filter((s) => s.flag);
  for (const itemSetId of new Set(defective.map((s) => s.itemSetId))) {
    const qs = defective.filter((s) => s.itemSetId === itemSetId);
    const note = qs
      .map((q) => `pregunta ${q.questionId}: ${Math.round(q.pCorrect * 100)}% de aciertos, discriminación ${q.discrimination?.toFixed(2) ?? "—"}`)
      .join("; ");
    const moved = await db.examItemSet.updateMany({ where: { id: itemSetId, status: "APPROVED" }, data: { status: "REVIEW", reviewNote: `Calibración: ${note}` } });
    if (!moved.count) continue;
    summary.sentToReview++;
    await db.moderationFlag.create({ data: { kind: "CALIBRATION", refId: `${itemSetId}#${qs[0].questionId}`, severity: "HIGH", note: `${exam} · ${note}` } });
    await db.auditLog.create({ data: { action: "exam.item_calibration_review", entity: "ExamItemSet", entityId: itemSetId, after: { questions: qs.map((q) => q.questionId) } } });
  }

  if (exam === "IELTS_ACADEMIC") summary.formsCalibrated = await calibrateIeltsForms(new Map(stats.map((s) => [`${s.itemSetId}#${s.questionId}`, s])), opts.minResponses);
  return summary;
}

const BASE_TABLE: Partial<Record<ExamSectionCode, [number, number][]>> = { LISTENING: IELTS_LISTENING_TABLE, READING: IELTS_READING_ACADEMIC_TABLE };

/** Una forma queda calibrada cuando todas sus preguntas objetivas tienen suficientes respuestas. */
async function calibrateIeltsForms(stats: Map<string, { n: number; difficulty: number }>, minResponses: number): Promise<number> {
  const forms = await db.examForm.findMany({ where: { exam: "IELTS_ACADEMIC" } });
  let calibrated = 0;
  for (const form of forms) {
    const blocks = form.blocks as unknown as FormBlocks;
    const conversion: FormConversion = {};
    let complete = true;
    for (const section of ["LISTENING", "READING"] as const) {
      const ids = blocks.sections.find((s) => s.section === section)?.parts.map((p) => p.itemSetId) ?? [];
      const items = await db.examItemSet.findMany({ where: { id: { in: ids } }, select: { id: true, answerKey: true } });
      const bs: number[] = [];
      for (const it of items) {
        for (const q of Object.keys((it.answerKey as { questions?: Record<string, unknown> }).questions ?? {})) {
          const s = stats.get(`${it.id}#${q}`);
          if (!s || s.n < minResponses) complete = false;
          else bs.push(s.difficulty);
        }
      }
      if (!complete || !bs.length) {
        complete = false;
        break;
      }
      conversion[section] = equateTable(BASE_TABLE[section]!, bs);
    }
    await db.examForm.update({
      where: { id: form.id },
      data: complete ? { calibrated: true, conversion: conversion as unknown as Prisma.InputJsonValue } : { calibrated: false },
    });
    if (complete) calibrated++;
  }
  return calibrated;
}

/** Tabla calibrada de la forma de un simulacro (o null si la forma sigue en calibracion). */
export async function mockFormTable(mockId: string, section: ExamSectionCode): Promise<[number, number][] | null> {
  const mock = await db.examAttempt.findUnique({ where: { id: mockId }, select: { form: { select: { calibrated: true, conversion: true } } } });
  if (!mock?.form?.calibrated) return null;
  return (mock.form.conversion as FormConversion | null)?.[section] ?? null;
}
