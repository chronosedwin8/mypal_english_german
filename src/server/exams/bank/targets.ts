/**
 * Que partes del examen tienen bloques propios en el banco y de que tipo.
 * IELTS Speaking Parte 3 sale del mismo bloque que la Parte 2 (la discusion
 * va ligada al tema de la tarjeta).
 */
import { examSpec, partSpec, sectionSpec } from "@/content/exams";
import type { ExamCode, ExamSectionCode, PartSpec, SectionSpec } from "@/content/exams/types";

import type { BankKind } from "./schemas";

/** Examenes cuyo banco sabe generar el motor. */
export const BANK_EXAMS: ExamCode[] = ["IELTS_ACADEMIC", "GOETHE_B1", "GOETHE_B2", "GOETHE_C1", "TESTDAF"];

export interface BankTarget {
  exam: ExamCode;
  section: ExamSectionCode;
  part: number;
  kind: BankKind;
}

export function bankKind(exam: ExamCode, section: ExamSectionCode, part: number): BankKind | null {
  if (exam !== "IELTS_ACADEMIC") {
    // Aleman: cada parte es su propio bloque.
    if (!examSpec(exam).sections.find((s) => s.section === section)?.parts.some((p) => p.part === part)) return null;
    return section === "LISTENING" ? "listening" : section === "READING" ? "reading" : section === "WRITING" ? "writingTask" : "speakingTask";
  }
  switch (section) {
    case "LISTENING":
      return "listening";
    case "READING":
      return "reading";
    case "WRITING":
      return part === 1 ? "writing1" : part === 2 ? "writing2" : null;
    case "SPEAKING":
      return part === 1 ? "speaking1" : part === 2 ? "speaking2" : null;
  }
}

export function bankTargets(exam: ExamCode): BankTarget[] {
  if (!BANK_EXAMS.includes(exam)) return [];
  const out: BankTarget[] = [];
  for (const s of examSpec(exam).sections)
    for (const p of s.parts) {
      const kind = bankKind(exam, s.section, p.part);
      if (kind) out.push({ exam, section: s.section, part: p.part, kind });
    }
  return out;
}

/** Numero de la primera pregunta de la parte (IELTS numera 1–40 por seccion). */
export function firstQuestionNumber(section: SectionSpec, part: number): number {
  let n = 1;
  for (const p of section.parts) {
    if (p.part === part) return n;
    n += p.items;
  }
  throw new Error(`Parte ${part} no existe en ${section.section}`);
}

export function targetSpecs(t: Pick<BankTarget, "exam" | "section" | "part">): { section: SectionSpec; part: PartSpec } {
  return { section: sectionSpec(t.exam, t.section), part: partSpec(t.exam, t.section, t.part) };
}
