import { GOETHE_B1, GOETHE_B2, GOETHE_C1 } from "./goethe";
import { IELTS_ACADEMIC } from "./ielts-academic";
import { TESTDAF } from "./testdaf";
import type { ExamCode, ExamSectionCode, ExamSpec, PartSpec } from "./types";

export * from "./types";

export const EXAMS: Record<ExamCode, ExamSpec> = {
  IELTS_ACADEMIC,
  GOETHE_B1,
  GOETHE_B2,
  GOETHE_C1,
  TESTDAF,
};

export const EXAM_CODES = Object.keys(EXAMS) as ExamCode[];

export function examSpec(code: ExamCode): ExamSpec {
  return EXAMS[code];
}

export function sectionSpec(code: ExamCode, section: ExamSectionCode) {
  const s = EXAMS[code].sections.find((x) => x.section === section);
  if (!s) throw new Error(`El examen ${code} no tiene la seccion ${section}`);
  return s;
}

export function partSpec(code: ExamCode, section: ExamSectionCode, part: number): PartSpec {
  const p = sectionSpec(code, section).parts.find((x) => x.part === part);
  if (!p) throw new Error(`El examen ${code} no tiene ${section} parte ${part}`);
  return p;
}

export function isExamCode(v: unknown): v is ExamCode {
  return typeof v === "string" && v in EXAMS;
}

/** Secciones que se califican solas (sin IA). */
export const OBJECTIVE_SECTIONS: ExamSectionCode[] = ["LISTENING", "READING"];
