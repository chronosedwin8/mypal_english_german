/**
 * Perfil de cada examen: idioma, escala de notas y criterios de calificacion.
 * IELTS da bandas 0–9; Goethe da puntos 0–100 por modulo (aprobado con 60);
 * TestDaF da una escala 0–20 por seccion convertida a TDN 3/4/5.
 */
import { examSpec } from "@/content/exams";
import {
  GOETHE_PASS,
  IELTS_LISTENING_TABLE,
  IELTS_READING_ACADEMIC_TABLE,
  goethePoints,
  ieltsToCefr,
  proportionalBand,
  rawToBand,
  testdafScale,
  testdafTdn,
  type TdnCutoffs,
} from "@/content/exams/scales";
import type { ExamCode, ExamSectionCode } from "@/content/exams/types";

export type ScaleKind = "ielts" | "goethe" | "testdaf";

export interface ScaleResult {
  /** valor en la escala del examen (banda, puntos o escala 0–20) */
  value: number;
  /** "Banda 6.5", "72 puntos", "TDN 4" */
  label: string;
  /** solo Goethe: aprobado o no */
  pass?: boolean;
  /** con pocas preguntas o sin la seccion completa */
  estimate: boolean;
}

export function scaleKind(exam: ExamCode): ScaleKind {
  if (exam === "IELTS_ACADEMIC") return "ielts";
  if (exam === "TESTDAF") return "testdaf";
  return "goethe";
}

export function examLanguage(exam: ExamCode): "en" | "de" {
  return examSpec(exam).language;
}

/** Nota de una seccion objetiva (Listening/Reading, Hören/Lesen). */
export function objectiveScale(
  exam: ExamCode,
  section: ExamSectionCode,
  correct: number,
  total: number,
  opts: { full: boolean; cutoffs?: TdnCutoffs },
): ScaleResult | null {
  if (total < 10 && !opts.full) return null;
  const kind = scaleKind(exam);
  if (kind === "ielts") {
    const table = section === "LISTENING" ? IELTS_LISTENING_TABLE : IELTS_READING_ACADEMIC_TABLE;
    const band = opts.full && total === 40 ? rawToBand(correct, table) : proportionalBand(correct, total, table);
    return { value: band, label: `Banda ${band.toFixed(1)}`, estimate: !(opts.full && total === 40) };
  }
  if (kind === "goethe") {
    const points = goethePoints(correct, total);
    return { value: points, label: `${points} puntos`, pass: points >= GOETHE_PASS, estimate: !opts.full };
  }
  const scale = testdafScale(correct, total);
  const tdn = testdafTdn(scale, opts.cutoffs ?? { tdn5: 16, tdn4: 12, tdn3: 8 });
  return { value: scale, label: `${tdn} (${scale}/20)`, estimate: !opts.full };
}

/** Criterios de las tareas productivas por examen (Writing/Schreiben y Speaking/Sprechen). */
export const PRODUCTIVE_CRITERIA: Record<"goethe" | "testdaf", { WRITING: { key: string; labelEs: string; de: string }[]; SPEAKING: { key: string; labelEs: string; de: string }[] }> = {
  goethe: {
    WRITING: [
      { key: "ERF", labelEs: "Cumplimiento de la tarea", de: "Erfüllung" },
      { key: "KOH", labelEs: "Coherencia", de: "Kohärenz" },
      { key: "WOR", labelEs: "Vocabulario", de: "Wortschatz" },
      { key: "STR", labelEs: "Estructuras", de: "Strukturen" },
    ],
    SPEAKING: [
      { key: "ERF", labelEs: "Cumplimiento de la tarea", de: "Erfüllung" },
      { key: "KOH", labelEs: "Coherencia", de: "Kohärenz" },
      { key: "WOR", labelEs: "Vocabulario", de: "Wortschatz" },
      { key: "STR", labelEs: "Estructuras", de: "Strukturen" },
      { key: "AUS", labelEs: "Pronunciación", de: "Aussprache" },
    ],
  },
  testdaf: {
    WRITING: [
      { key: "GES", labelEs: "Impresión general", de: "Gesamteindruck" },
      { key: "BEH", labelEs: "Tratamiento de la tarea", de: "Behandlung der Aufgabe" },
      { key: "SPR", labelEs: "Lengua", de: "Sprachliche Realisierung" },
    ],
    SPEAKING: [
      { key: "GES", labelEs: "Impresión general", de: "Gesamteindruck" },
      { key: "BEH", labelEs: "Tratamiento de la tarea", de: "Behandlung der Aufgabe" },
      { key: "SPR", labelEs: "Lengua", de: "Sprachliche Realisierung" },
    ],
  },
};

/** Cada criterio se califica de 0 a 5 (A–E del Goethe y niveles del TestDaF, simplificados). */
export const CRITERION_MAX = 5;

/** Convierte criterios 0–5 en la nota del examen. */
export function productiveScale(exam: ExamCode, scores: number[], cutoffs?: TdnCutoffs): ScaleResult {
  const fraction = scores.length ? scores.reduce((a, b) => a + b, 0) / (scores.length * CRITERION_MAX) : 0;
  if (scaleKind(exam) === "goethe") {
    const points = Math.round(fraction * 100);
    return { value: points, label: `${points} puntos`, pass: points >= GOETHE_PASS, estimate: false };
  }
  const scale = Math.round(fraction * 20);
  return { value: scale, label: `${testdafTdn(scale, cutoffs ?? { tdn5: 16, tdn4: 12, tdn3: 8 })} (${scale}/20)`, estimate: false };
}

/** Nivel MCER aproximado (solo IELTS tiene tabla oficial; Goethe es el nivel del examen). */
export function cefrOf(exam: ExamCode, value: number): string {
  if (scaleKind(exam) === "ielts") return ieltsToCefr(value);
  return examSpec(exam).cefr === "ALL" ? "" : examSpec(exam).cefr;
}

/** Banda IELTS equivalente para la dificultad del banco aleman (para equilibrar inventario). */
export const GERMAN_TARGET_BAND: Record<Exclude<ExamCode, "IELTS_ACADEMIC">, number> = {
  GOETHE_B1: 4.5,
  GOETHE_B2: 6,
  GOETHE_C1: 7.5,
  TESTDAF: 6.5,
};
