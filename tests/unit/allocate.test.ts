import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  BUCKET_PRIORITY,
  InsufficientBalanceError,
  allocate,
  availableIn,
  eligibleBuckets,
  planSettlement,
  type BucketSourceName,
  type BucketView,
} from "@/server/ledger/allocate";

const now = new Date("2026-10-11T12:00:00Z");
const day = 86_400_000;

function bucket(id: string, source: BucketSourceName, granted: number, opts: Partial<BucketView> = {}): BucketView {
  return {
    id,
    source,
    priority: BUCKET_PRIORITY[source],
    grantedSeconds: granted,
    heldSeconds: 0,
    consumedSeconds: 0,
    expiredSeconds: 0,
    validFrom: new Date(now.getTime() - day),
    expiresAt: new Date(now.getTime() + 30 * day),
    revokedAt: null,
    createdAt: new Date(now.getTime() - day),
    ...opts,
  };
}

describe("eligibleBuckets", () => {
  it("orden: plan -> admin -> recargas (la que vence antes primero)", () => {
    const list = [
      bucket("t2", "TOPUP", 900, { expiresAt: new Date(now.getTime() + 80 * day) }),
      bucket("a", "ADMIN_GRANT", 300),
      bucket("t1", "TOPUP", 900, { expiresAt: new Date(now.getTime() + 10 * day) }),
      bucket("p", "PLAN_CYCLE", 3600),
    ];
    expect(eligibleBuckets(list, { isTrial: false, now }).map((b) => b.id)).toEqual(["p", "a", "t1", "t2"]);
  });

  it("la prueba solo usa su cubo y las clases pagadas nunca lo tocan", () => {
    const list = [bucket("trial", "TRIAL", 320), bucket("p", "PLAN_CYCLE", 600)];
    expect(eligibleBuckets(list, { isTrial: true, now }).map((b) => b.id)).toEqual(["trial"]);
    expect(eligibleBuckets(list, { isTrial: false, now }).map((b) => b.id)).toEqual(["p"]);
  });

  it("excluye vencidos, revocados, futuros y vacios", () => {
    const list = [
      bucket("vencido", "PLAN_CYCLE", 600, { expiresAt: new Date(now.getTime() - 1) }),
      bucket("revocado", "TOPUP", 600, { revokedAt: now }),
      bucket("futuro", "TOPUP", 600, { validFrom: new Date(now.getTime() + 1) }),
      bucket("vacio", "TOPUP", 600, { consumedSeconds: 600 }),
      bucket("ok", "TOPUP", 600, { heldSeconds: 100 }),
    ];
    expect(eligibleBuckets(list, { isTrial: false, now }).map((b) => b.id)).toEqual(["ok"]);
  });
});

describe("allocate", () => {
  it("reparte en orden hasta cubrir la necesidad", () => {
    const ordered = [bucket("p", "PLAN_CYCLE", 300, { consumedSeconds: 100 }), bucket("t", "TOPUP", 900)];
    expect(allocate(ordered, 500)).toEqual([
      { bucketId: "p", seconds: 200, allocOrder: 0 },
      { bucketId: "t", seconds: 300, allocOrder: 1 },
    ]);
  });

  it("lanza si no alcanza", () => {
    expect(() => allocate([bucket("p", "PLAN_CYCLE", 100)], 101)).toThrow(InsufficientBalanceError);
  });

  it("propiedad: nunca toma mas de lo disponible y la suma es exacta", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 2000 }), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 1, max: 5000 }),
        (amounts, need) => {
          const ordered = amounts.map((a, i) => bucket(`b${i}`, "TOPUP", a));
          const total = amounts.reduce((s, a) => s + a, 0);
          if (need > total) {
            expect(() => allocate(ordered, need)).toThrow(InsufficientBalanceError);
            return;
          }
          const allocs = allocate(ordered, need);
          expect(allocs.reduce((s, a) => s + a.seconds, 0)).toBe(need);
          for (const a of allocs) {
            const b = ordered.find((x) => x.id === a.bucketId)!;
            expect(a.seconds).toBeGreaterThan(0);
            expect(a.seconds).toBeLessThanOrEqual(availableIn(b));
          }
        },
      ),
    );
  });
});

describe("planSettlement", () => {
  const holds = [
    { bucketId: "p", allocOrder: 0, heldSeconds: 200, capturedSeconds: 0, releasedSeconds: 0 },
    { bucketId: "t", allocOrder: 1, heldSeconds: 720, capturedSeconds: 0, releasedSeconds: 0 },
  ];

  it("cobra en el orden de retencion y libera el resto", () => {
    expect(planSettlement(holds, 354)).toEqual({
      captures: [
        { bucketId: "p", seconds: 200 },
        { bucketId: "t", seconds: 154 },
      ],
      releases: [{ bucketId: "t", seconds: 566 }],
      overrunSeconds: 0,
    });
  });

  it("cobro 0 libera todo", () => {
    expect(planSettlement(holds, 0)).toEqual({
      captures: [],
      releases: [
        { bucketId: "p", seconds: 200 },
        { bucketId: "t", seconds: 720 },
      ],
      overrunSeconds: 0,
    });
  });

  it("reporta exceso si se cobra mas de lo retenido", () => {
    expect(planSettlement(holds, 1000).overrunSeconds).toBe(80);
  });

  it("retenciones ya liquidadas no producen movimientos", () => {
    const done = holds.map((h) => ({ ...h, capturedSeconds: 10, releasedSeconds: h.heldSeconds - 10 }));
    expect(planSettlement(done, 500)).toEqual({ captures: [], releases: [], overrunSeconds: 500 });
  });
});
