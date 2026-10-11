import { randomUUID } from "node:crypto";

import fc from "fast-check";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { InsufficientBalanceError } from "@/server/ledger/allocate";
import {
  checkLedgerInvariants,
  expireUserBuckets,
  getBalance,
  grantSeconds,
  placeHold,
  revokeBucket,
  settleSessionHolds,
  withTx,
} from "@/server/ledger/wallet";

import { createTestUser, inDays, resetDatabase } from "./helpers";

/** Crea una fila TutorSession minima para colgar retenciones. */
async function createSession(userId: string, isTrial = false) {
  const id = randomUUID();
  await db.tutorSession.create({
    data: {
      id,
      userId,
      language: "EN_US",
      isTrial,
      // Estado terminal: no choca con el indice "una clase abierta por usuario".
      status: "SETTLED",
      clientRequestId: randomUUID(),
      palId: "p-test",
      conversationName: `mypal:${id}`,
      reservedSeconds: 0,
      maxCallDurationSec: 0,
      costPerMinMicroUsd: 350_000,
    },
  });
  return id;
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("ledger de minutos", () => {
  it("otorgar es idempotente por grantKey", async () => {
    const u = await createTestUser();
    const input = {
      userId: u.id,
      source: "TOPUP" as const,
      seconds: 900,
      expiresAt: inDays(90),
      grantKey: "topup:pago-1",
    };
    const a = await withTx((tx) => grantSeconds(tx, input));
    const b = await withTx((tx) => grantSeconds(tx, input));
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect((await getBalance(u.id)).paidAvailableSeconds).toBe(900);
    expect(await checkLedgerInvariants(u.id)).toEqual([]);
  });

  it("retener y liquidar cobra lo usado y devuelve el resto", async () => {
    const u = await createTestUser();
    await withTx((tx) =>
      grantSeconds(tx, { userId: u.id, source: "PLAN_CYCLE", seconds: 3600, expiresAt: inDays(30), grantKey: "plan:1" }),
    );
    const sid = await createSession(u.id);
    const now = new Date();
    await withTx((tx) => placeHold(tx, { userId: u.id, sessionId: sid, isTrial: false, seconds: 920, now }));
    expect((await getBalance(u.id)).paidAvailableSeconds).toBe(2680);

    const r1 = await withTx((tx) => settleSessionHolds(tx, { userId: u.id, sessionId: sid, chargeSeconds: 354, now }));
    expect(r1).toMatchObject({ capturedSeconds: 354, releasedSeconds: 566, uncollectedSeconds: 0 });
    // Repetir la liquidacion no mueve nada.
    const r2 = await withTx((tx) => settleSessionHolds(tx, { userId: u.id, sessionId: sid, chargeSeconds: 354, now }));
    expect(r2).toMatchObject({ capturedSeconds: 0, releasedSeconds: 0 });

    const bal = await getBalance(u.id);
    expect(bal.paidAvailableSeconds).toBe(3600 - 354);
    expect(bal.heldSeconds).toBe(0);
    expect(await checkLedgerInvariants(u.id)).toEqual([]);
  });

  it("consume el plan antes que las recargas, y las recargas por vencimiento", async () => {
    const u = await createTestUser();
    await withTx(async (tx) => {
      await grantSeconds(tx, { userId: u.id, source: "TOPUP", seconds: 900, expiresAt: inDays(80), grantKey: "t-late" });
      await grantSeconds(tx, { userId: u.id, source: "TOPUP", seconds: 900, expiresAt: inDays(10), grantKey: "t-soon" });
      await grantSeconds(tx, { userId: u.id, source: "PLAN_CYCLE", seconds: 300, expiresAt: inDays(30), grantKey: "plan" });
    });
    const sid = await createSession(u.id);
    const allocs = await withTx((tx) =>
      placeHold(tx, { userId: u.id, sessionId: sid, isTrial: false, seconds: 1000, now: new Date() }),
    );
    const buckets = await db.minuteBucket.findMany({ where: { id: { in: allocs.map((a) => a.bucketId) } } });
    const keyById = new Map(buckets.map((b) => [b.id, b.grantKey]));
    expect(allocs.map((a) => [keyById.get(a.bucketId), a.seconds])).toEqual([
      ["plan", 300],
      ["t-soon", 700],
    ]);
  });

  it("la prueba es de un solo uso: lo no usado vence al liquidar", async () => {
    const u = await createTestUser();
    await withTx((tx) =>
      grantSeconds(tx, { userId: u.id, source: "TRIAL", seconds: 320, expiresAt: inDays(7), grantKey: `trial:${u.id}` }),
    );
    const sid = await createSession(u.id, true);
    const now = new Date();
    await withTx((tx) => placeHold(tx, { userId: u.id, sessionId: sid, isTrial: true, seconds: 320, now }));
    const r = await withTx((tx) => settleSessionHolds(tx, { userId: u.id, sessionId: sid, chargeSeconds: 120, now }));
    expect(r).toMatchObject({ capturedSeconds: 120, releasedSeconds: 200, expiredAfterSeconds: 200 });
    expect((await getBalance(u.id)).trialAvailableSeconds).toBe(0);
    expect(await checkLedgerInvariants(u.id)).toEqual([]);
  });

  it("concurrencia: 10 retenciones simultaneas con saldo para 3", async () => {
    const u = await createTestUser();
    await withTx((tx) =>
      grantSeconds(tx, { userId: u.id, source: "PLAN_CYCLE", seconds: 1000, expiresAt: inDays(30), grantKey: "p" }),
    );
    const sessions = await Promise.all(Array.from({ length: 10 }, () => createSession(u.id)));
    const results = await Promise.allSettled(
      sessions.map((sid) =>
        withTx((tx) => placeHold(tx, { userId: u.id, sessionId: sid, isTrial: false, seconds: 300, now: new Date() })),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const insufficient = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof InsufficientBalanceError,
    ).length;
    expect(ok).toBe(3);
    expect(insufficient).toBe(7);
    const bal = await getBalance(u.id);
    expect(bal.paidAvailableSeconds).toBe(100);
    expect(bal.heldSeconds).toBe(900);
    expect(await checkLedgerInvariants(u.id)).toEqual([]);
  });

  it("vencimiento y reembolso retiran solo lo disponible", async () => {
    const u = await createTestUser();
    const { bucket: plan } = await withTx((tx) =>
      grantSeconds(tx, { userId: u.id, source: "PLAN_CYCLE", seconds: 600, expiresAt: inDays(30), grantKey: "p" }),
    );
    await withTx((tx) =>
      grantSeconds(tx, {
        userId: u.id,
        source: "TOPUP",
        seconds: 300,
        validFrom: inDays(-2),
        expiresAt: new Date(Date.now() - 1000),
        grantKey: "old",
      }),
    );
    expect(await withTx((tx) => expireUserBuckets(tx, u.id, new Date()))).toBe(300);
    expect(await withTx((tx) => expireUserBuckets(tx, u.id, new Date()))).toBe(0);

    const sid = await createSession(u.id);
    await withTx((tx) => placeHold(tx, { userId: u.id, sessionId: sid, isTrial: false, seconds: 200, now: new Date() }));
    const clawed = await withTx((tx) =>
      revokeBucket(tx, { userId: u.id, bucketId: plan.id, reason: "reembolso", now: new Date() }),
    );
    expect(clawed).toBe(400);
    // Lo retenido de un cubo revocado vence al liquidar.
    const r = await withTx((tx) =>
      settleSessionHolds(tx, { userId: u.id, sessionId: sid, chargeSeconds: 60, now: new Date() }),
    );
    expect(r).toMatchObject({ capturedSeconds: 60, releasedSeconds: 140, expiredAfterSeconds: 140 });
    expect((await getBalance(u.id)).paidAvailableSeconds).toBe(0);
    expect(await checkLedgerInvariants(u.id)).toEqual([]);
  });

  it("la base de datos bloquea modificar o borrar el ledger", async () => {
    const u = await createTestUser();
    await withTx((tx) =>
      grantSeconds(tx, { userId: u.id, source: "TOPUP", seconds: 60, expiresAt: inDays(1), grantKey: "x" }),
    );
    await expect(db.ledgerEntry.updateMany({ data: { seconds: 999 } })).rejects.toThrow();
    await expect(db.ledgerEntry.deleteMany({})).rejects.toThrow();
  });

  it("la base de datos impide saldos negativos aunque el codigo fallara", async () => {
    const u = await createTestUser();
    await withTx((tx) =>
      grantSeconds(tx, { userId: u.id, source: "TOPUP", seconds: 60, expiresAt: inDays(1), grantKey: "y" }),
    );
    await expect(
      db.minuteWallet.update({ where: { userId: u.id }, data: { availableSeconds: { decrement: 61 } } }),
    ).rejects.toThrow();
    const b = await db.minuteBucket.findFirstOrThrow({ where: { userId: u.id } });
    await expect(
      db.minuteBucket.update({ where: { id: b.id }, data: { consumedSeconds: 61 } }),
    ).rejects.toThrow();
  });

  it("propiedad: secuencias aleatorias mantienen las invariantes", async () => {
    type Op =
      | { k: "grant"; s: number; src: "PLAN_CYCLE" | "TOPUP" | "ADMIN_GRANT"; days: number }
      | { k: "hold"; s: number }
      | { k: "settle"; pick: number; charge: number }
      | { k: "expire" }
      | { k: "revoke"; pick: number };
    const opArb: fc.Arbitrary<Op> = fc.oneof(
      fc.record({
        k: fc.constant("grant" as const),
        s: fc.integer({ min: 1, max: 1200 }),
        src: fc.constantFrom("PLAN_CYCLE" as const, "TOPUP" as const, "ADMIN_GRANT" as const),
        days: fc.integer({ min: -2, max: 30 }),
      }),
      fc.record({ k: fc.constant("hold" as const), s: fc.integer({ min: 1, max: 900 }) }),
      fc.record({ k: fc.constant("settle" as const), pick: fc.nat(), charge: fc.integer({ min: 0, max: 1000 }) }),
      fc.record({ k: fc.constant("expire" as const) }),
      fc.record({ k: fc.constant("revoke" as const), pick: fc.nat() }),
    );

    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { minLength: 1, maxLength: 12 }), async (ops) => {
        await resetDatabase();
        const u = await createTestUser();
        const open: string[] = [];
        let n = 0;
        for (const op of ops) {
          const now = new Date();
          if (op.k === "grant") {
            await withTx((tx) =>
              grantSeconds(tx, {
                userId: u.id,
                source: op.src,
                seconds: op.s,
                validFrom: inDays(-3),
                expiresAt: inDays(op.days),
                grantKey: `g${n++}`,
              }),
            );
          } else if (op.k === "hold") {
            const sid = await createSession(u.id);
            try {
              await withTx((tx) => placeHold(tx, { userId: u.id, sessionId: sid, isTrial: false, seconds: op.s, now }));
              open.push(sid);
            } catch (e) {
              if (!(e instanceof InsufficientBalanceError)) throw e;
            }
          } else if (op.k === "settle" && open.length) {
            const sid = open.splice(op.pick % open.length, 1)[0];
            await withTx((tx) => settleSessionHolds(tx, { userId: u.id, sessionId: sid, chargeSeconds: op.charge, now }));
          } else if (op.k === "expire") {
            await withTx((tx) => expireUserBuckets(tx, u.id, now));
          } else if (op.k === "revoke") {
            const buckets = await db.minuteBucket.findMany({ where: { userId: u.id }, orderBy: { createdAt: "asc" } });
            if (buckets.length) {
              const b = buckets[op.pick % buckets.length];
              await withTx((tx) => revokeBucket(tx, { userId: u.id, bucketId: b.id, reason: "test", now }));
            }
          }
          const violations = await checkLedgerInvariants(u.id);
          if (violations.length) throw new Error(JSON.stringify(violations));
        }
      }),
      { numRuns: 30 },
    );
  }, 180_000);
});
