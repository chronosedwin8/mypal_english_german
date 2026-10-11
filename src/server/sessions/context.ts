/**
 * Contexto que recibe el tutor en cada clase (conversational_context) y saludo.
 * Va en ingles porque es para el LLM; el saludo va en el idioma meta.
 */
import type { Cefr, TargetLang } from "@/generated/prisma/client";
import { db } from "@/server/db";

const GREETING: Record<TargetLang, (name: string) => string> = {
  EN_US: (n) => `Hi ${n}! I'm Poly, your English tutor. How are you doing today?`,
  EN_GB: (n) => `Hello ${n}! I'm Poly, your English tutor. How are you today?`,
  DE: (n) => `Hallo ${n}! Ich bin Poly, deine Deutschlehrerin. Wie geht's dir heute?`,
};

const TRIAL_GREETING: Record<TargetLang, (name: string) => string> = {
  EN_US: (n) => `Hi ${n}! I'm Poly. Welcome to your free five-minute class. Ready to chat?`,
  EN_GB: (n) => `Hello ${n}! I'm Poly. Welcome to your free five-minute class. Shall we have a chat?`,
  DE: (n) => `Hallo ${n}! Ich bin Poly. Willkommen zu deiner kostenlosen Fünf-Minuten-Stunde. Wollen wir loslegen?`,
};

export function targetCode(language: TargetLang): "en" | "de" {
  return language === "DE" ? "de" : "en";
}

/** A1–A2 tambien entienden español (el principiante puede pedir ayuda). */
export function conversationLanguages(language: TargetLang, level: Cefr | null): string[] {
  const target = targetCode(language);
  return !level || level === "A1" || level === "A2" ? [target, "es"] : [target];
}

export function firstName(name: string): string {
  return (name.trim().split(/\s+/)[0] || "there").slice(0, 30);
}

export async function buildContext(input: {
  userId: string;
  userName: string;
  language: TargetLang;
  level: Cefr | null;
  lessonId: string | null;
  isTrial: boolean;
  maxCallSeconds: number;
}): Promise<{ context: string; greeting: string; languages: string[] }> {
  const name = firstName(input.userName);
  const minutes = Math.max(1, Math.round(input.maxCallSeconds / 60));
  const [lesson, dueWords, corrections, lastTranscript] = await Promise.all([
    input.lessonId ? db.lesson.findUnique({ where: { id: input.lessonId }, include: { module: true } }) : null,
    db.vocabularyItem.findMany({
      where: { userId: input.userId, language: input.language, dueAt: { lte: new Date() } },
      orderBy: { dueAt: "asc" },
      take: 8,
      select: { term: true },
    }),
    db.sessionCorrection.findMany({
      where: { userId: input.userId, session: { language: input.language } },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { original: true, corrected: true },
    }),
    db.transcript.findFirst({
      where: { session: { userId: input.userId, language: input.language }, summaryEs: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { summaryEs: true },
    }),
  ]);

  const lines: string[] = [
    `Student: ${name}. Native language: Spanish.`,
    `CEFR level: ${input.level ?? "unknown (assume A2 and adapt quickly)"}.`,
    `This class lasts about ${minutes} minute${minutes === 1 ? "" : "s"}; it will end automatically.`,
  ];
  if (input.isTrial) {
    lines.push(
      "This is the student's FREE TRIAL class (their first time). Make it warm and impressive: get them speaking within the first 20 seconds, and show at least once that you can see what they hold up to the camera.",
    );
  }
  if (lesson) {
    lines.push(`Lesson: "${lesson.titleEs}" (module "${lesson.module.titleEs}", ${lesson.module.level}).`);
    lines.push(`Lesson goal for the tutor: ${lesson.tutorBrief}`);
    if (lesson.targetVocab.length) lines.push(`Target vocabulary: ${lesson.targetVocab.join(", ")}.`);
  } else {
    lines.push("Free conversation: ask what they would like to talk about, or propose an everyday topic suited to their level.");
  }
  if (dueWords.length) lines.push(`Words the student is reviewing (recycle naturally): ${dueWords.map((w) => w.term).join(", ")}.`);
  if (corrections.length) {
    lines.push(
      `Recent mistakes to watch for: ${corrections.map((c) => `"${c.original}" -> "${c.corrected}"`).join("; ")}.`,
    );
  }
  if (lastTranscript?.summaryEs) lines.push(`Summary of the previous class (in Spanish): ${lastTranscript.summaryEs}`);

  return {
    context: lines.join("\n"),
    greeting: (input.isTrial ? TRIAL_GREETING : GREETING)[input.language](name),
    languages: conversationLanguages(input.language, input.level),
  };
}
