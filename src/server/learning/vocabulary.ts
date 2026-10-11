/**
 * Vocabulario del estudiante con repaso espaciado (SM-2 simplificado).
 * Costo $0: las palabras las guarda el tutor con su herramienta o vienen de las lecciones.
 */
import type { TargetLang } from "@/generated/prisma/client";
import { db } from "@/server/db";

export function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
}

export async function addVocabulary(input: {
  userId: string;
  language: TargetLang;
  term: string;
  translationEs: string | null;
  example: string | null;
  source: "TOOL_CALL" | "LESSON" | "MANUAL";
  sessionId?: string | null;
}) {
  const termNormalized = normalizeTerm(input.term);
  if (!termNormalized) return null;
  return db.vocabularyItem.upsert({
    where: { userId_language_termNormalized: { userId: input.userId, language: input.language, termNormalized } },
    create: {
      userId: input.userId,
      language: input.language,
      term: input.term.trim().slice(0, 80),
      termNormalized,
      translationEs: input.translationEs,
      example: input.example,
      source: input.source,
      sessionId: input.sessionId ?? null,
    },
    update: {
      // Si el tutor lo vuelve a guardar, completamos datos que faltaban.
      translationEs: input.translationEs ?? undefined,
      example: input.example ?? undefined,
    },
  });
}

export type ReviewGrade = "again" | "hard" | "good" | "easy";

/** Siguiente repaso segun la respuesta (puro, para tests). */
export function nextReview(
  item: { ease: number; intervalDays: number; reps: number; lapses: number },
  grade: ReviewGrade,
  now = new Date(),
) {
  let { ease, intervalDays, reps, lapses } = item;
  if (grade === "again") {
    lapses += 1;
    reps = 0;
    intervalDays = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    const q = grade === "hard" ? 3 : grade === "good" ? 4 : 5;
    ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    intervalDays = reps === 1 ? (grade === "easy" ? 3 : 1) : reps === 2 ? (grade === "hard" ? 3 : 6) : Math.round(intervalDays * ease * (grade === "hard" ? 0.8 : grade === "easy" ? 1.3 : 1));
  }
  // "again": se repite en 10 minutos.
  const dueAt = new Date(now.getTime() + (intervalDays === 0 ? 10 * 60_000 : intervalDays * 86_400_000));
  return { ease, intervalDays, reps, lapses, dueAt };
}

export async function reviewVocabulary(userId: string, itemId: string, grade: ReviewGrade) {
  const item = await db.vocabularyItem.findFirst({ where: { id: itemId, userId } });
  if (!item) return null;
  return db.vocabularyItem.update({ where: { id: item.id }, data: nextReview(item, grade) });
}
