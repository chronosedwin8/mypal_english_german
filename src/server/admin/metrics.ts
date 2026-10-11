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
