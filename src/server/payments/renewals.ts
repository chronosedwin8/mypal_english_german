/**
 * Renovaciones mensuales simuladas (con una pasarela real las dispara su webhook).
 * Suscripciones vencidas: si pidio cancelar, se cancelan; si no, se "cobra" el
 * siguiente ciclo y se otorgan sus minutos.
 */
import { planById } from "@/lib/pricing/catalog";
import { db } from "@/server/db";

import { applyPaymentEvent } from "./apply-event";
import { FAKE_PROVIDER_ID, addMonth, simulatedFee } from "./fake-provider";

export async function renewSubscription(subscriptionId: string, now = new Date()) {
  const sub = await db.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub || sub.status === "CANCELED" || sub.currentPeriodEnd > now) return false;
  if (sub.cancelAtPeriodEnd) {
    await db.subscription.update({ where: { id: sub.id }, data: { status: "CANCELED", canceledAt: now } });
    return false;
  }
  if (sub.provider !== FAKE_PROVIDER_ID) return false; // las reales las renueva su pasarela
  const plan = planById(sub.planId);
  if (!plan) return false;
  const periodStart = sub.currentPeriodEnd;
  const periodEnd = addMonth(periodStart);
  const cycleKey = `${sub.id}.${periodStart.toISOString()}`;
  await applyPaymentEvent({
    type: "CYCLE_PAID",
    provider: FAKE_PROVIDER_ID,
    eventId: `renew_${cycleKey}`,
    externalPaymentId: `pay_renew_${cycleKey}`,
    externalSubscriptionId: sub.externalId,
    userId: sub.userId,
    planId: plan.id,
    amountUsdCents: plan.priceUsdCents,
    feeUsdCents: simulatedFee(plan.priceUsdCents),
    periodStart,
    periodEnd,
  });
  return true;
}

export async function runRenewals(now = new Date()) {
  const due = await db.subscription.findMany({
    where: { status: { in: ["ACTIVE", "PAST_DUE"] }, currentPeriodEnd: { lte: now } },
    select: { id: true },
  });
  let renewed = 0;
  for (const s of due) if (await renewSubscription(s.id, now)) renewed++;
  return renewed;
}
