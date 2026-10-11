/** Consultas de lectura para las paginas del estudiante. */
import type { TargetLang } from "@/generated/prisma/client";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { getBalance } from "@/server/ledger/wallet";

export async function accountSummary(userId: string) {
  const config = await getConfig();
  const [balance, sub, trialClaim, diagnostics, profiles, openSession] = await Promise.all([
    getBalance(userId),
    db.subscription.findFirst({
      where: { userId, status: { in: ["ACTIVE", "PAST_DUE"] } },
      include: { plan: true },
    }),
    db.trialClaim.findUnique({ where: { userId } }),
    db.diagnosticAttempt.count({ where: { userId, status: "COMPLETED" } }),
    db.languageProfile.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
    db.tutorSession.findFirst({
      where: { userId, status: { in: ["RESERVED", "CREATING", "READY", "LIVE", "ENDING"] } },
      select: { id: true, status: true },
    }),
  ]);
  const trialAvailable = config["trial.enabled"] && !trialClaim;
  return {
    balance,
    subscription: sub,
    trialAvailable,
    trialSeconds: config["trial.seconds"],
    hasDiagnostic: diagnostics > 0,
    needsDiagnosticForTrial: config["trial.requireDiagnostic"] && diagnostics === 0,
    profiles,
    openSession,
  };
}

export async function recentSessions(userId: string, take = 5) {
  return db.tutorSession.findMany({
    where: { userId, status: "SETTLED", joinedAt: { not: null } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, language: true, isTrial: true, chargedSeconds: true, createdAt: true, lessonId: true },
  });
}

export async function lessonsFor(language: TargetLang) {
  const lang = language === "DE" ? "DE" : "EN";
  return db.module.findMany({
    where: { lang, isPublished: true },
    orderBy: [{ sortOrder: "asc" }],
    include: { lessons: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function dueVocabularyCount(userId: string) {
  return db.vocabularyItem.count({ where: { userId, dueAt: { lte: new Date() } } });
}
