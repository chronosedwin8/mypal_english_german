/**
 * Pasarela SIMULADA: no cobra dinero real. Sirve para probar todo el flujo
 * (planes, recargas, renovaciones, cancelacion, reembolso) antes de conectar
 * Stripe, Mercado Pago o Wompi.
 */
import { createHmac, randomUUID } from "node:crypto";

import { planById, topupById } from "@/lib/pricing/catalog";
import { DEFAULT_COSTS } from "@/lib/pricing/margin";

import { applyPaymentEvent } from "./apply-event";
import type { CheckoutRequest, PaymentProvider } from "./provider";

export const FAKE_PROVIDER_ID = "fake";

function sign(payload: string) {
  const secret = process.env.BETTER_AUTH_SECRET ?? "dev";
  return createHmac("sha256", secret).update(`checkout:${payload}`).digest("base64url").slice(0, 24);
}

/** Comision simulada (la misma que asume el calculo de margen). */
export function simulatedFee(amountUsdCents: number) {
  return Math.round(amountUsdCents * DEFAULT_COSTS.feePct + DEFAULT_COSTS.feeFixedUsdCents);
}

export function addMonth(d: Date) {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + 1);
  return r;
}

export class FakePaymentProvider implements PaymentProvider {
  readonly id = FAKE_PROVIDER_ID;

  async createCheckout(req: CheckoutRequest) {
    const ref = `${req.kind}.${req.itemId}.${req.userId}.${Date.now()}`;
    return { url: `/app/pagar?ref=${encodeURIComponent(ref)}&sig=${sign(ref)}` };
  }

  /** Lee y valida una referencia de checkout (que no la haya alterado el usuario). */
  parseCheckout(ref: string, sig: string, userId: string) {
    if (sign(ref) !== sig) return null;
    const [kind, itemId, uid, ts] = ref.split(".");
    if (uid !== userId || (kind !== "plan" && kind !== "topup")) return null;
    if (Date.now() - Number(ts) > 60 * 60_000) return null; // vence en 1 hora
    const item = kind === "plan" ? planById(itemId) : topupById(itemId);
    if (!item) return null;
    return { kind, itemId, item, ref } as const;
  }

  /** "Pago aprobado": genera el mismo evento que enviaria una pasarela real. */
  async completeCheckout(ref: string, userId: string) {
    const [kind, itemId] = ref.split(".");
    const eventId = `evt_${ref}`;
    if (kind === "plan") {
      const plan = planById(itemId)!;
      const start = new Date();
      return applyPaymentEvent({
        type: "CYCLE_PAID",
        provider: FAKE_PROVIDER_ID,
        eventId,
        externalPaymentId: `pay_${ref}`,
        externalSubscriptionId: `sub_${userId}_${randomUUID().slice(0, 8)}`,
        userId,
        planId: plan.id,
        amountUsdCents: plan.priceUsdCents,
        feeUsdCents: simulatedFee(plan.priceUsdCents),
        periodStart: start,
        periodEnd: addMonth(start),
      });
    }
    const pack = topupById(itemId)!;
    return applyPaymentEvent({
      type: "TOPUP_PAID",
      provider: FAKE_PROVIDER_ID,
      eventId,
      externalPaymentId: `pay_${ref}`,
      userId,
      topupId: pack.id,
      amountUsdCents: pack.priceUsdCents,
      feeUsdCents: simulatedFee(pack.priceUsdCents),
    });
  }
}

export const fakePayments = new FakePaymentProvider();
