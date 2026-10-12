import "server-only";

import type { ExamCode } from "@/content/exams/types";
import { db } from "@/server/db";

import type { MockScores } from "../exams/mock";

export interface ErrorStats {
  n: number;
  /** promedio de (simulador − referencia): positivo = el simulador da mas */
  bias: number;
  /** error absoluto medio */
  mae: number;
  /** proporcion a ±0,5 banda (IELTS) o ±5 puntos (aleman) */
  within: number;
}

export function errorStats(diffs: number[], tolerance: number): ErrorStats | null {
  if (!diffs.length) return null;
  const n = diffs.length;
  return {
    n,
    bias: diffs.reduce((a, d) => a + d, 0) / n,
    mae: diffs.reduce((a, d) => a + Math.abs(d), 0) / n,
    within: diffs.filter((d) => Math.abs(d) <= tolerance + 1e-9).length / n,
  };
}

const SECTIONS = ["overall", "listening", "reading", "writing", "speaking"] as const;
type Section = (typeof SECTIONS)[number];

/**
 * Simulador frente a notas oficiales (IELTS): cada nota oficial se compara con el ultimo
 * simulacro completo de la misma persona hecho hasta 120 dias antes del examen real.
 */
export async function officialAccuracy(): Promise<{ pairs: number; reported: number; bySection: Record<Section, ErrorStats | null> }> {
  const results = await db.officialResult.findMany({ where: { exam: "IELTS_ACADEMIC" }, orderBy: { takenAt: "desc" }, take: 2000 });
  const diffs: Record<Section, number[]> = { overall: [], listening: [], reading: [], writing: [], speaking: [] };
  let pairs = 0;
  for (const r of results) {
    const mock = await db.examAttempt.findFirst({
      where: {
        userId: r.userId,
        exam: "IELTS_ACADEMIC",
        mode: "MOCK",
        status: "COMPLETED",
        completedAt: { lte: r.takenAt, gte: new Date(r.takenAt.getTime() - 120 * 86_400_000) },
      },
      orderBy: { completedAt: "desc" },
      select: { scores: true },
    });
    const sim = mock?.scores as unknown as MockScores | null;
    if (!sim) continue;
    pairs++;
    const official = r.scores as Partial<Record<Section, number | null>>;
    const simulated: Record<Section, number | null | undefined> = {
      overall: sim.overall,
      listening: sim.listening?.band,
      reading: sim.reading?.band,
      writing: sim.writing?.band,
      speaking: sim.speaking?.band,
    };
    for (const s of SECTIONS) {
      const o = official[s];
      const v = simulated[s];
      if (typeof o === "number" && typeof v === "number") diffs[s].push(v - o);
    }
  }
  return {
    pairs,
    reported: results.length,
    bySection: Object.fromEntries(SECTIONS.map((s) => [s, errorStats(diffs[s], 0.5)])) as Record<Section, ErrorStats | null>,
  };
}

/** IA frente a docentes: la nota del docente es la referencia (por examen y tipo de tarea). */
export async function teacherAccuracy(): Promise<{ exam: ExamCode; kind: "WRITING" | "SPEAKING"; stats: ErrorStats }[]> {
  const reviews = await db.teacherReview.findMany({ where: { aiScore: { not: null } }, orderBy: { createdAt: "asc" } });
  // Solo la ultima revision de cada entrega cuenta.
  const latest = new Map(reviews.map((r) => [`${r.kind}:${r.submissionId}`, r]));
  const writingIds = [...latest.values()].filter((r) => r.kind === "WRITING").map((r) => r.submissionId);
  const speakingIds = [...latest.values()].filter((r) => r.kind === "SPEAKING").map((r) => r.submissionId);
  const [w, s] = await Promise.all([
    db.writingSubmission.findMany({ where: { id: { in: writingIds } }, select: { id: true, attempt: { select: { exam: true } } } }),
    db.speakingSubmission.findMany({ where: { id: { in: speakingIds } }, select: { id: true, attempt: { select: { exam: true } } } }),
  ]);
  const examOf = new Map([...w, ...s].map((x) => [x.id, x.attempt.exam]));
  const groups = new Map<string, number[]>();
  for (const r of latest.values()) {
    const exam = examOf.get(r.submissionId);
    if (!exam) continue;
    const k = `${exam}|${r.kind}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r.aiScore! - r.score);
  }
  return [...groups].map(([k, diffs]) => {
    const [exam, kind] = k.split("|") as [ExamCode, "WRITING" | "SPEAKING"];
    return { exam, kind, stats: errorStats(diffs, exam === "IELTS_ACADEMIC" ? 0.5 : exam === "TESTDAF" ? 1 : 5)! };
  });
}

/** Resumen de la calibracion del banco por examen. */
export async function calibrationOverview() {
  const [byExam, defective, forms] = await Promise.all([
    db.examItemStat.groupBy({ by: ["exam"], _count: true, _avg: { pCorrect: true, discrimination: true } }),
    db.examItemStat.findMany({ where: { flag: { not: null } }, orderBy: { discrimination: "asc" }, take: 50 }),
    db.examForm.groupBy({ by: ["exam", "calibrated"], _count: true }),
  ]);
  return { byExam, defective, forms };
}
