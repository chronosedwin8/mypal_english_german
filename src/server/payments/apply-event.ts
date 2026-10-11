/**
 * Aplica eventos de pago (de cualquier pasarela) de forma idempotente:
 * cada evento se procesa una sola vez y cada pago otorga minutos una sola vez.
 */
import { planById, topupById } from "@/lib/pricing/catalog";
import { db } from "@/server/db";
import { grantSeconds, revokeBucket, withTx } from "@/server/ledger/wallet";

import type { PaymentEvent } from "./provider";

export class PaymentError extends Error {
  constructor(
    readonly code: "UNKNOWN_ITEM" | "NO_ACTIVE_PLAN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

export async function applyPaymentEvent(event: PaymentEvent): Promise<{ applied: boolean }> {
  return withTx(async (tx) => {
    const seen = await tx.processedWebhookEvent.findUnique({
      where: { provider_eventId: { provider: event.provider, eventId: event.eventId } },
    });
    if (seen) return { applied: false };
    await tx.processedWebhookEvent.create({ data: { provider: event.provider, eventId: event.eventId, type: event.type } });

    switch (event.type) {
      case "CYCLE_PAID": {
        const plan = planById(event.planId);
        if (!plan) throw new PaymentError("UNKNOWN_ITEM", `Plan desconocido: ${event.planId}`);
        // Un plan vivo por usuario: si cambia de plan, el anterior se cierra (sus minutos siguen vigentes).
        await tx.subscription.updateMany({
          where: {
            userId: event.userId,
            status: { in: ["ACTIVE", "PAST_DUE"] },
            NOT: { provider: event.provider, externalId: event.externalSubscriptionId },
          },
          data: { status: "CANCELED", canceledAt: new Date() },
        });
        const sub = await tx.subscription.upsert({
          where: { provider_externalId: { provider: event.provider, externalId: event.externalSubscriptionId } },
          create: {
            userId: event.userId,
            planId: plan.id,
            provider: event.provider,
            externalId: event.externalSubscriptionId,
            status: "ACTIVE",
            currentPeriodStart: event.periodStart,
            currentPeriodEnd: event.periodEnd,
          },
          update: {
            planId: plan.id,
            status: "ACTIVE",
            currentPeriodStart: event.periodStart,
            currentPeriodEnd: event.periodEnd,
          },
        });
        const payment = await tx.payment.create({
          data: {
            userId: event.userId,
            provider: event.provider,
            externalId: event.externalPaymentId,
            kind: "SUBSCRIPTION",
            status: "SUCCEEDED",
            subscriptionId: sub.id,
            planId: plan.id,
            amountUsdCents: event.amountUsdCents,
            feeUsdCents: event.feeUsdCents,
            netUsdCents: event.amountUsdCents - event.feeUsdCents,
            secondsGranted: plan.monthlySeconds,
            periodStart: event.periodStart,
            periodEnd: event.periodEnd,
          },
        });
        await grantSeconds(tx, {
          userId: event.userId,
          source: "PLAN_CYCLE",
          seconds: plan.monthlySeconds,
          validFrom: event.periodStart,
          // +1 h de gracia por si una clase termina justo al cambiar de ciclo.
          expiresAt: new Date(event.periodEnd.getTime() + 3_600_000),
          grantKey: `plan:${payment.id}`,
          paymentId: payment.id,
          subscriptionId: sub.id,
          reason: `plan ${plan.nameEs}`,
        });
        return { applied: true };
      }

      case "TOPUP_PAID": {
        const pack = topupById(event.topupId);
        if (!pack) throw new PaymentError("UNKNOWN_ITEM", `Recarga desconocida: ${event.topupId}`);
        const payment = await tx.payment.create({
          data: {
            userId: event.userId,
            provider: event.provider,
            externalId: event.externalPaymentId,
            kind: "TOPUP",
            status: "SUCCEEDED",
            topupPackId: pack.id,
            amountUsdCents: event.amountUsdCents,
            feeUsdCents: event.feeUsdCents,
            netUsdCents: event.amountUsdCents - event.feeUsdCents,
            secondsGranted: pack.seconds,
          },
        });
        await grantSeconds(tx, {
          userId: event.userId,
          source: "TOPUP",
          seconds: pack.seconds,
          expiresAt: new Date(Date.now() + pack.validityDays * 86_400_000),
          grantKey: `topup:${payment.id}`,
          paymentId: payment.id,
          reason: pack.nameEs,
        });
        return { applied: true };
      }

      case "SUBSCRIPTION_CANCEL_REQUESTED": {
        const sub = await tx.subscription.findUnique({
          where: { provider_externalId: { provider: event.provider, externalId: event.externalSubscriptionId } },
        });
        if (!sub) throw new PaymentError("NOT_FOUND", "Suscripción no encontrada");
        await tx.subscription.update({
          where: { id: sub.id },
          data: event.atPeriodEnd
            ? { cancelAtPeriodEnd: true }
            : { status: "CANCELED", canceledAt: new Date(), cancelAtPeriodEnd: false },
        });
        return { applied: true };
      }

      case "PAYMENT_REFUNDED": {
        const payment = await tx.payment.findUnique({
          where: { provider_externalId: { provider: event.provider, externalId: event.externalPaymentId } },
        });
        if (!payment) throw new PaymentError("NOT_FOUND", "Pago no encontrado");
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "REFUNDED", refundedUsdCents: payment.amountUsdCents },
        });
        const bucket = await tx.minuteBucket.findUnique({ where: { paymentId: payment.id } });
        if (bucket) {
          await revokeBucket(tx, { userId: payment.userId, bucketId: bucket.id, reason: "reembolso", now: new Date() });
        }
        if (payment.subscriptionId) {
          await tx.subscription.update({
            where: { id: payment.subscriptionId },
            data: { status: "CANCELED", canceledAt: new Date() },
          });
        }
        return { applied: true };
      }
    }
  });
}

/** El usuario necesita un plan activo para comprar recargas. */
export async function hasActivePlan(userId: string) {
  return Boolean(
    await db.subscription.findFirst({ where: { userId, status: { in: ["ACTIVE", "PAST_DUE"] } }, select: { id: true } }),
  );
}
