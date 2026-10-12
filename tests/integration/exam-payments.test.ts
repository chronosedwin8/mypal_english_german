import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ALL_PLANS, planKind } from "@/lib/pricing/catalog";
import { db } from "@/server/db";
import { quotaSummary, reserveQuota, consumeQuota } from "@/server/exams/entitlements";
import { getBalance } from "@/server/ledger/wallet";
import { applyPaymentEvent, hasActivePlan } from "@/server/payments/apply-event";

import { createTestUser, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  await db.plan.createMany({
    data: ALL_PLANS.map((p) => ({
      id: p.id,
      nameEs: p.nameEs,
      priceUsdCents: p.priceUsdCents,
      monthlySeconds: p.monthlySeconds,
      perSessionCapSeconds: p.perSessionCapSeconds,
      sortOrder: p.sortOrder,
      features: p.features,
      kind: planKind(p),
      examQuotas: p.examQuotas ? { ...p.examQuotas } : undefined,
    })),
  });
});
afterAll(async () => {
  await db.$disconnect();
});

const now = () => new Date();
const inMonth = () => new Date(Date.now() + 30 * 86_400_000);

function cycle(userId: string, planId: string, n: string) {
  return applyPaymentEvent({
    type: "CYCLE_PAID",
    provider: "fake",
    eventId: `evt_${n}`,
    externalPaymentId: `pay_${n}`,
    externalSubscriptionId: `sub_${userId}_${planId}`,
    userId,
    planId,
    amountUsdCents: 1900,
    feeUsdCents: 144,
    periodStart: now(),
    periodEnd: inMonth(),
  });
}

describe("productos de examen", () => {
  it("el Plan Examen otorga cupos (una sola vez) y convive con el plan de tutor", async () => {
    const u = await createTestUser();
    await cycle(u.id, "fluido", "t1");
    expect(await cycle(u.id, "plan-examen", "e1")).toEqual({ applied: true });
    expect(await cycle(u.id, "plan-examen", "e1")).toEqual({ applied: false }); // evento repetido

    expect(await quotaSummary(u.id)).toMatchObject({ MOCK: { available: 2 }, WRITING: { available: 8 }, SPEAKING: { available: 10 } });
    const subs = await db.subscription.findMany({ where: { userId: u.id, status: "ACTIVE" } });
    expect(subs.map((s) => s.kind).sort()).toEqual(["EXAM", "TUTOR"]);
    // el plan de examen no da minutos con el avatar
    expect((await getBalance(u.id)).paidAvailableSeconds).toBe(60 * 60);
    expect(await hasActivePlan(u.id)).toBe(true);

    // Cambiar a Intensivo cierra el Plan Examen pero no el de tutor
    await cycle(u.id, "examen-intensivo", "e2");
    const live = await db.subscription.findMany({ where: { userId: u.id, status: "ACTIVE" } });
    expect(live.map((s) => s.planId).sort()).toEqual(["examen-intensivo", "fluido"]);
    expect((await quotaSummary(u.id)).MOCK.available).toBe(6);
  });

  it("un reembolso retira lo no usado de los cupos del pago", async () => {
    const u = await createTestUser();
    await cycle(u.id, "plan-examen", "r1");
    await reserveQuota({ userId: u.id, kind: "WRITING", refId: "w1" });
    await consumeQuota({ userId: u.id, kind: "WRITING", refId: "w1" });
    await applyPaymentEvent({ type: "PAYMENT_REFUNDED", provider: "fake", eventId: "refund_r1", externalPaymentId: "pay_r1" });
    const q = await quotaSummary(u.id);
    expect(q.WRITING).toMatchObject({ used: 1, available: 0 });
    expect(q.MOCK.available).toBe(0);
  });
});
