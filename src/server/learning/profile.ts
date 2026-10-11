import type { DiagnosticAttempt, TargetLang } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { pepperedHash } from "@/server/security";

/** Etiqueta estable (y no reversible) para la memoria del tutor en Tavus. */
export function memoryTagFor(userId: string, language: TargetLang): string {
  return `u_${pepperedHash(`memory:${userId}`).slice(0, 20)}_${language.toLowerCase()}`;
}

export async function ensureProfile(userId: string, language: TargetLang) {
  return db.languageProfile.upsert({
    where: { userId_language: { userId, language } },
    create: { userId, language, memoryTag: memoryTagFor(userId, language) },
    update: {},
  });
}

/** Aplica el resultado del test al perfil, salvo que ya haya un nivel mas reciente. */
export async function applyDiagnosticToProfile(userId: string, attempt: DiagnosticAttempt) {
  if (attempt.status !== "COMPLETED" || !attempt.resultLevel) return;
  const profile = await ensureProfile(userId, attempt.language);
  const newer = profile.levelSource && profile.levelSource !== "DIAGNOSTIC" && profile.updatedAt > (attempt.completedAt ?? new Date(0));
  if (newer) return;
  await db.languageProfile.update({
    where: { id: profile.id },
    data: {
      level: attempt.resultLevel,
      levelSource: "DIAGNOSTIC",
      theta: attempt.theta,
      skillScores: attempt.skillScores ?? undefined,
    },
  });
}
