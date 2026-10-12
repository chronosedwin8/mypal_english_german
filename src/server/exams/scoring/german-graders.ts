/**
 * Calificadores de Schreiben y Sprechen (Goethe y TestDaF). Resumen propio de los
 * criterios publicos, no copia de los Bewertungskriterien oficiales. Cada criterio
 * se califica de 0 a 5; el codigo convierte a puntos (Goethe) o a TDN (TestDaF).
 */
import { z } from "zod";

import { examSpec } from "@/content/exams";
import type { ExamCode } from "@/content/exams/types";

import { CRITERION_MAX, PRODUCTIVE_CRITERIA, scaleKind } from "../profiles";

export const GERMAN_RUBRIC_VERSION = "de-productive-2026-10-v1";

const LEVELS = `Scale per criterion (whole numbers):
5 = fully meets the level: complete, precise, varied and nearly error-free for the CEFR level.
4 = meets the level well with minor gaps or occasional errors.
3 = meets the level only partly: noticeable gaps, simple or repetitive language, errors that sometimes hinder.
2 = below the level: important parts missing, limited language, frequent errors.
1 = far below the level: hardly understandable or mostly off-task.
0 = nothing assessable (no answer, wrong language or memorised text).`;

const MEANING: Record<string, string> = {
  ERF: "Erfüllung: all content points covered, appropriate register, text type and length.",
  KOH: "Kohärenz: logical structure, paragraphs, connectors, references.",
  WOR: "Wortschatz: range and precision of vocabulary for the level.",
  STR: "Strukturen: range and accuracy of grammar, word order, spelling/punctuation (writing).",
  AUS: "Aussprache: intelligibility, sounds, word and sentence stress, intonation (judge mainly from the audio).",
  GES: "Gesamteindruck: overall communicative effect and fluency/flow.",
  BEH: "Behandlung der Aufgabe: task fulfilment, relevance, structure and argumentation.",
  SPR: "Sprachliche Realisierung: range and accuracy of vocabulary and grammar.",
};

export function criteriaFor(exam: ExamCode, section: "WRITING" | "SPEAKING") {
  return PRODUCTIVE_CRITERIA[scaleKind(exam) === "testdaf" ? "testdaf" : "goethe"][section];
}

export function germanGraderSystem(exam: ExamCode, section: "WRITING" | "SPEAKING"): string {
  const spec = examSpec(exam);
  const criteria = criteriaFor(exam, section);
  return `You are a certified examiner for the ${spec.name} (${spec.cefr === "ALL" ? "B2–C1" : spec.cefr}). Grade the ${section === "WRITING" ? "written" : "spoken"} performance strictly and consistently, as in the official exam.
Criteria:
${criteria.map((c) => `- ${c.key}: ${MEANING[c.key]}`).join("\n")}
${LEVELS}
Write every comment in neutral, encouraging Spanish with correct accents (á, é, í, ó, ú, ñ); quote the candidate's German when useful. Return ONLY JSON.`;
}

/** Esquema de salida segun los criterios del examen. */
export function germanGradeSchema(exam: ExamCode, section: "WRITING" | "SPEAKING", withFeedback: boolean) {
  const criteria = criteriaFor(exam, section);
  const shape = Object.fromEntries(
    criteria.map((c) => [c.key, z.object({ score: z.number().int().min(0).max(CRITERION_MAX), commentEs: z.string().min(3) })]),
  );
  const base = z.object({ criteria: z.object(shape) });
  if (!withFeedback) return base;
  return base.extend({
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
    improvedVersion: z.string().min(30),
    nextStepsEs: z.array(z.string()).max(4),
  });
}

export function germanWritingPrompt(c: { examName: string; partTitle: string; prompt: string; contentPoints: string[]; minWords: number; words: number; chart?: unknown; text: string }, withFeedback: boolean) {
  return [
    `${c.examName}, Schreiben ${c.partTitle}. Minimum length: ${c.minWords} words. The candidate wrote ${c.words} words.`,
    "TASK:",
    c.prompt,
    c.contentPoints.length ? `Content points (Inhaltspunkte): ${c.contentPoints.join(" | ")}` : "",
    c.chart ? `Chart data: ${JSON.stringify(c.chart)}` : "",
    "CANDIDATE TEXT:",
    '"""',
    c.text,
    '"""',
    withFeedback
      ? "Also give: overviewEs (2–4 sentences in Spanish), errors (up to 15: quote = exact words copied from the text, correction in German, explanationEs), improvedVersion (the text rewritten one level better, keeping the ideas, in German) and nextStepsEs (up to 4)."
      : "",
  ].join("\n");
}
