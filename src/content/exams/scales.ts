/**
 * Escalas oficiales (calculo en codigo; la IA nunca calcula notas).
 * Las tablas de conversion son ESTIMACIONES basadas en referencias publicas.
 */

/** IELTS: promedio de 4 secciones redondeado a la media banda; ,25 sube a ,5 y ,75 sube al entero. */
export function ieltsRoundOverall(average: number): number {
  return Math.floor(average * 2 + 0.5 + 1e-9) / 2;
}

export function ieltsOverall(sections: { listening: number; reading: number; writing: number; speaking: number }): number {
  const avg = (sections.listening + sections.reading + sections.writing + sections.speaking) / 4;
  return ieltsRoundOverall(avg);
}

/** Redondea a la media banda mas cercana (para criterios promediados). */
export function toHalfBand(value: number): number {
  return Math.max(0, Math.min(9, Math.round(value * 2) / 2));
}

/** Aciertos minimos por banda (referencias publicas aproximadas; 40 preguntas). */
export const IELTS_LISTENING_TABLE: [number, number][] = [
  [39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [11, 4], [8, 3.5], [6, 3], [4, 2.5], [3, 2], [2, 1.5], [1, 1],
];

export const IELTS_READING_ACADEMIC_TABLE: [number, number][] = [
  [39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [3, 2], [2, 1.5], [1, 1],
];

/** Convierte aciertos sobre 40 a banda. `shift` desplaza los cortes de formas calibradas (+1 = mas dificil). */
export function rawToBand(correct: number, table: [number, number][], shift = 0): number {
  const c = Math.max(0, Math.min(40, Math.round(correct)));
  for (const [min, band] of table) if (c >= Math.min(40, min + shift)) return band;
  return 0;
}

/** Escala proporcional para practicas con menos de 40 preguntas. */
export function proportionalBand(correct: number, total: number, table: [number, number][]): number {
  if (total <= 0) return 0;
  return rawToBand((correct / total) * 40, table);
}

/** Writing IELTS: (Tarea 1 + 2 × Tarea 2) / 3, a media banda (supuesto configurable). */
export function ieltsWritingBand(task1: number, task2: number, task2Weight = 2): number {
  return toHalfBand((task1 + task2Weight * task2) / (1 + task2Weight));
}

// ---------------------------------------------------------------------------
// Goethe
// ---------------------------------------------------------------------------

/** Lesen/Hören: aciertos sobre 30 llevados a 100 (B1: 25 → 83). */
export function goethePoints(correct: number, total = 30): number {
  if (total <= 0) return 0;
  return Math.round((Math.max(0, Math.min(total, correct)) * 100) / total);
}

export type GoetheGrade = "sehr gut" | "gut" | "befriedigend" | "ausreichend" | "nicht bestanden";

export function goetheGrade(points: number): GoetheGrade {
  if (points >= 90) return "sehr gut";
  if (points >= 80) return "gut";
  if (points >= 70) return "befriedigend";
  if (points >= 60) return "ausreichend";
  return "nicht bestanden";
}

export const GOETHE_PASS = 60;

// ---------------------------------------------------------------------------
// TestDaF
// ---------------------------------------------------------------------------

/** Puntos brutos a escala 0–20. */
export function testdafScale(raw: number, rawMax: number): number {
  if (rawMax <= 0) return 0;
  return Math.round((Math.max(0, Math.min(rawMax, raw)) / rawMax) * 20 * 10) / 10;
}

/** Cortes ESTIMADOS de la escala 0–20 a TDN (se ajustan desde la configuracion). */
export interface TdnCutoffs {
  tdn5: number;
  tdn4: number;
  tdn3: number;
}

export function testdafTdn(scale20: number, cut: TdnCutoffs): "TDN 5" | "TDN 4" | "TDN 3" | "unter TDN 3" {
  if (scale20 >= cut.tdn5) return "TDN 5";
  if (scale20 >= cut.tdn4) return "TDN 4";
  if (scale20 >= cut.tdn3) return "TDN 3";
  return "unter TDN 3";
}

/** Equivalencia aproximada IELTS → MCER (para el informe). */
export function ieltsToCefr(band: number): string {
  if (band >= 8) return "C2";
  if (band >= 7) return "C1";
  if (band >= 5.5) return "B2";
  if (band >= 4) return "B1";
  return "A2 o inferior";
}
