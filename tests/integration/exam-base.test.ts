import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { QuotaError, consumeQuota, grantQuota, quotaSummary, releaseQuota, reserveQuota } from "@/server/exams/entitlements";
import { claimJobs, completeJob, enqueue, failJob } from "@/server/jobs/queue";

import { createTestUser, inDays, resetDatabase } from "./helpers";

beforeEach(resetDatabase);
afterAll(async () => {
  await db.$disconnect();
});

describe("cupos de examen", () => {
  it("otorgar es idempotente y reservar/consumir/devolver cuadra", async () => {
    const u = await createTestUser();
    const period = { periodStart: inDays(-1), periodEnd: inDays(30) };
    await grantQuota({ userId: u.id, kind: "MOCK", amount: 2, sourceKey: "plan:1:MOCK", ...period });
    await grantQuota({ userId: u.id, kind: "MOCK", amount: 2, sourceKey: "plan:1:MOCK", ...period });
    expect((await quotaSummary(u.id)).MOCK.available).toBe(2);

    await reserveQuota({ userId: u.id, kind: "MOCK", refId: "a1" });
    await reserveQuota({ userId: u.id, kind: "MOCK", refId: "a1" }); // repetido
    expect((await quotaSummary(u.id)).MOCK).toMatchObject({ reserved: 1, available: 1 });

    await consumeQuota({ userId: u.id, kind: "MOCK", refId: "a1" });
    await releaseQuota({ userId: u.id, kind: "MOCK", refId: "a1" }); // ya consumido: no hace nada
    expect((await quotaSummary(u.id)).MOCK).toMatchObject({ used: 1, reserved: 0, available: 1 });

    await reserveQuota({ userId: u.id, kind: "MOCK", refId: "a2" });
    await releaseQuota({ userId: u.id, kind: "MOCK", refId: "a2" });
    expect((await quotaSummary(u.id)).MOCK.available).toBe(1);
  });

  it("10 reservas simultaneas con cupo para 3", async () => {
    const u = await createTestUser();
    await grantQuota({ userId: u.id, kind: "WRITING", amount: 3, sourceKey: "s", periodStart: inDays(-1), periodEnd: inDays(30) });
    const r = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => reserveQuota({ userId: u.id, kind: "WRITING", refId: `w${i}` })),
    );
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(3);
    expect(r.filter((x) => x.status === "rejected" && x.reason instanceof QuotaError)).toHaveLength(7);
  });

  it("la base de datos impide usar mas de lo otorgado", async () => {
    const u = await createTestUser();
    const e = await grantQuota({ userId: u.id, kind: "SPEAKING", amount: 1, sourceKey: "x", periodStart: inDays(-1), periodEnd: inDays(1) });
    await expect(db.examEntitlement.update({ where: { id: e!.id }, data: { used: 2 } })).rejects.toThrow();
    await expect(db.examUsageEvent.deleteMany({})).rejects.toThrow();
  });

  it("el administrador no consume cupo", async () => {
    const u = await createTestUser({ role: "ADMIN" });
    expect(await reserveQuota({ userId: u.id, kind: "MOCK", refId: "z", unlimited: true })).toEqual({ entitlementId: null });
  });
});

describe("cola de trabajos", () => {
  it("dos consumidores no toman el mismo trabajo; dedupe y reintentos", async () => {
    await enqueue("writing.grade", { id: 1 }, { dedupeKey: "w1" });
    await enqueue("writing.grade", { id: 1 }, { dedupeKey: "w1" });
    await enqueue("writing.grade", { id: 2 });
    expect(await db.examJob.count()).toBe(2);

    const [a, b] = await Promise.all([claimJobs(5), claimJobs(5)]);
    expect(a.length + b.length).toBe(2);
    const ids = new Set([...a, ...b].map((j) => j.id));
    expect(ids.size).toBe(2);

    const [first, second] = [...a, ...b];
    await completeJob(first.id, { ok: true });
    await failJob(second.id, "error temporal");
    const retried = await db.examJob.findUniqueOrThrow({ where: { id: second.id } });
    expect(retried.status).toBe("QUEUED");
    expect(retried.runAfter.getTime()).toBeGreaterThan(Date.now());
  });
});
