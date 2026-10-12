/**
 * Metricas del negocio para el panel de administracion.
 * Margen real, margen "peor caso" (si se usaran todos los minutos vendidos aun
 * vigentes) y margen con el costo fijo del plan de Tavus incluido.
 */
import { TAVUS_TIERS, cheapestTavusTier, tavusMonthlyCostCents } from "@/lib/pricing/margin";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";

export function monthStart(d = new Date()) {
  const s = new Date(d);
  s.setUTCDate(1);
  s.setUTCHours(0, 0, 0, 0);
  return s;
}

export async function businessMetrics() {
  const config = await getConfig();
  const since = monthStart();
  const now = new Date();
  const costPerMinCents = config["tavus.costPerMinMicroUsd"] / 10_000;

  const [payments, sessions, trialSessions, openBuckets, activeSubs, users, uncollected] = await Promise.all([
    db.payment.aggregate({
      where: { createdAt: { gte: since }, status: { in: ["SUCCEEDED", "REFUNDED"] } },
      _sum: { amountUsdCents: true, feeUsdCents: true, refundedUsdCents: true },
      _count: true,
    }),
    db.tutorSession.aggregate({
      where: { createdAt: { gte: since }, status: "SETTLED", testMode: false, isTrial: false },
      _sum: { billedSeconds: true, chargedSeconds: true, costMicroUsd: true },
      _count: true,
    }),
    db.tutorSession.aggregate({
      where: { createdAt: { gte: since }, status: "SETTLED", testMode: false, isTrial: true },
      _sum: { billedSeconds: true, costMicroUsd: true },
      _count: true,
    }),
    db.minuteBucket.findMany({
      where: { source: { in: ["PLAN_CYCLE", "TOPUP"] }, revokedAt: null, expiresAt: { gt: now } },
      select: { grantedSeconds: true, consumedSeconds: true, expiredSeconds: true },
    }),
    db.subscription.groupBy({ by: ["planId"], where: { status: { in: ["ACTIVE", "PAST_DUE"] } }, _count: true }),
    db.user.count(),
    db.tutorSession.aggregate({ where: { createdAt: { gte: since } }, _sum: { uncollectedSeconds: true } }),
  ]);

  const grossCents = (payments._sum.amountUsdCents ?? 0) - (payments._sum.refundedUsdCents ?? 0);
  const feeCents = payments._sum.feeUsdCents ?? 0;
  const paidCostCents = Number(sessions._sum.costMicroUsd ?? BigInt(0)) / 10_000;
  const trialCostCents = Number(trialSessions._sum.costMicroUsd ?? BigInt(0)) / 10_000;
  const outstandingSeconds = openBuckets.reduce((s, b) => s + (b.grantedSeconds - b.consumedSeconds - b.expiredSeconds), 0);
  const outstandingCostCents = (outstandingSeconds / 60) * costPerMinCents;

  const billedMinutes = ((sessions._sum.billedSeconds ?? 0) + (trialSessions._sum.billedSeconds ?? 0)) / 60;
  const tier = TAVUS_TIERS.find((t) => t.id === config["tavus.tier"]) ?? TAVUS_TIERS[0];
  const tavusFixedCents = tier.monthlyFeeUsdCents;
  const tavusBillCents = tavusMonthlyCostCents(tier, billedMinutes);
  const recommended = cheapestTavusTier(billedMinutes + outstandingSeconds / 60);

  const margin = (cost: number) => (grossCents > 0 ? (grossCents - feeCents - cost) / grossCents : null);

  return {
    grossCents,
    feeCents,
    paymentsCount: payments._count,
    paidSessions: sessions._count,
    trialSessions: trialSessions._count,
    billedMinutes,
    paidCostCents,
    trialCostCents,
    outstandingSeconds,
    uncollectedSeconds: uncollected._sum.uncollectedSeconds ?? 0,
    realizedMargin: margin(paidCostCents),
    worstCaseMargin: margin(paidCostCents + outstandingCostCents),
    fullyLoadedMargin: margin(Math.max(tavusBillCents, paidCostCents + trialCostCents)),
    tavusTier: tier,
    tavusBillCents,
    tavusFixedCents,
    recommendedTier: recommended,
    activeSubs,
    users,
    targetMargin: 0.6,
  };
}

export async function liveOverview() {
  const [sessions, slots, queue] = await Promise.all([
    db.tutorSession.findMany({
      where: { status: { in: ["RESERVED", "CREATING", "READY", "LIVE", "ENDING", "ENDED"] } },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { email: true, name: true } } },
    }),
    db.concurrencySlot.findMany({ orderBy: { id: "asc" } }),
    db.sessionQueueEntry.findMany({
      where: { status: { in: ["WAITING", "OFFERED"] } },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { email: true } } },
    }),
  ]);
  return { sessions, slots, queue };
}

/** Examenes, instituciones y costos de IA/voz del mes. */
export async function examMetrics() {
  const since = monthStart();
  const now = new Date();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const config = await getConfig();
  const admins = (await db.user.findMany({ where: { role: { in: ["ADMIN", "SUPPORT"] } }, select: { id: true } })).map((u) => u.id);
  const [examPayments, licenses, usage, todayUsage, mocks, writing, speaking, bank, failedJobs, flags] = await Promise.all([
    db.payment.groupBy({
      by: ["planId"],
      where: { createdAt: { gte: since }, status: "SUCCEEDED", planId: { in: ["pase-examen", "plan-examen", "examen-intensivo"] } },
      _sum: { amountUsdCents: true, feeUsdCents: true },
      _count: true,
    }),
    db.orgLicense.findMany({ where: { periodStart: { lte: now }, periodEnd: { gt: now } } }),
    db.aiUsage.groupBy({ by: ["purpose", "provider"], where: { createdAt: { gte: since } }, _sum: { costMicroUsd: true }, _count: true }),
    db.aiUsage.aggregate({ where: { createdAt: { gte: dayStart } }, _sum: { costMicroUsd: true } }),
    db.examAttempt.count({ where: { mode: "MOCK", status: "COMPLETED", completedAt: { gte: since } } }),
    db.writingSubmission.count({ where: { status: "GRADED", gradedAt: { gte: since } } }),
    db.speakingSubmission.count({ where: { status: "GRADED", gradedAt: { gte: since } } }),
    db.examItemSet.groupBy({ by: ["status"], _count: true }),
    db.examJob.count({ where: { status: "FAILED", updatedAt: { gte: since } } }),
    db.moderationFlag.count({ where: { status: "OPEN" } }),
  ]);
  const internal = await db.aiUsage.aggregate({ where: { createdAt: { gte: since }, userId: { in: admins } }, _sum: { costMicroUsd: true } });
  const cents = (micro: bigint | null | undefined) => Number(micro ?? BigInt(0)) / 10_000;
  const bankCost = usage.filter((u) => u.purpose.startsWith("bank.")).reduce((s, u) => s + cents(u._sum.costMicroUsd), 0);
  const variableCost = usage.filter((u) => !u.purpose.startsWith("bank.") && u.purpose !== "health").reduce((s, u) => s + cents(u._sum.costMicroUsd), 0);
  const byProvider = Object.entries(
    usage.reduce<Record<string, number>>((acc, u) => ({ ...acc, [u.provider]: (acc[u.provider] ?? 0) + cents(u._sum.costMicroUsd) }), {}),
  ).map(([provider, c]) => ({ provider, cents: c }));
  return {
    examRevenueCents: examPayments.reduce((s, p) => s + (p._sum.amountUsdCents ?? 0), 0),
    examFeeCents: examPayments.reduce((s, p) => s + (p._sum.feeUsdCents ?? 0), 0),
    examByProduct: examPayments.map((p) => ({ planId: p.planId, count: p._count, cents: p._sum.amountUsdCents ?? 0 })),
    licenseMonthlyCents: licenses.reduce((s, l) => s + l.seats * l.priceUsdCents, 0),
    licenseSeats: licenses.reduce((s, l) => s + l.seats, 0),
    licenseUsed: licenses.reduce((s, l) => s + l.used, 0),
    bankCostCents: bankCost,
    variableAiCostCents: variableCost,
    internalAiCostCents: cents(internal._sum.costMicroUsd),
    byProvider,
    todayCents: cents(todayUsage._sum.costMicroUsd),
    dailyBudgetCents: config["ai.dailyBudgetUsd"] * 100,
    mocks,
    writing,
    speaking,
    bank: Object.fromEntries(bank.map((b) => [b.status, b._count])) as Record<string, number>,
    failedJobs,
    flags,
  };
}

/** Gasto de IA y voz de los ultimos `days` dias: por dia y proveedor, por funcion y las personas que mas gastan. */
export async function costReport(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [daily, byPurpose, topUsers] = await Promise.all([
    db.$queryRaw<{ day: Date; provider: string; micro: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, provider, SUM("costMicroUsd")::bigint AS micro
      FROM "AiUsage" WHERE "createdAt" >= ${since}
      GROUP BY 1, 2 ORDER BY 1 DESC`,
    db.aiUsage.groupBy({ by: ["purpose"], where: { createdAt: { gte: since } }, _sum: { costMicroUsd: true }, _count: true, orderBy: { _sum: { costMicroUsd: "desc" } } }),
    db.aiUsage.groupBy({ by: ["userId"], where: { createdAt: { gte: since }, userId: { not: null } }, _sum: { costMicroUsd: true }, orderBy: { _sum: { costMicroUsd: "desc" } }, take: 10 }),
  ]);
  const people = await db.user.findMany({ where: { id: { in: topUsers.map((u) => u.userId!) } }, select: { id: true, email: true, role: true } });
  return { daily, byPurpose, topUsers, people };
}
