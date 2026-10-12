import type { ExamCode } from "./types";

/** Rutas publicas de cada examen (una pagina por examen para busquedas). */
export const EXAM_SLUGS: Record<ExamCode, string> = {
  IELTS_ACADEMIC: "ielts-academic",
  GOETHE_B1: "goethe-b1",
  GOETHE_B2: "goethe-b2",
  GOETHE_C1: "goethe-c1",
  TESTDAF: "testdaf",
};

export function examBySlug(slug: string): ExamCode | null {
  return (Object.entries(EXAM_SLUGS).find(([, s]) => s === slug)?.[0] as ExamCode | undefined) ?? null;
}
