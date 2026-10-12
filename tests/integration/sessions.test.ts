import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PLANS, TOPUPS } from "@/lib/pricing/catalog";
import { invalidateConfigCache, setConfig } from "@/server/config";
import { db } from "@/server/db";
import { checkLedgerInvariants, getBalance, grantSeconds, withTx } from "@/server/ledger/wallet";
import { fakePayments } from "@/server/payments/fake-provider";
import { applyPaymentEvent } from "@/server/payments/apply-event";
import { runRenewals } from "@/server/payments/renewals";
import { SessionError } from "@/server/sessions/errors";
import {
  confirmEnded,
  markJoined,
  requestEnd,
  startSession,
  syncSlots,
  maintainQueue,
  type StartInput,
} from "@/server/sessions/lifecycle";
import { killOrphans, sweepSessions } from "@/server/sessions/sweep";
import { fakeState, resetFakeTavus } from "@/server/tavus/fake-client";

import { createTestUser, inDays, resetDatabase } from "./helpers";

let clock = Date.now();

async function baseSetup() {
  await resetDatabase();
  resetFakeTavus();
  clock = Date.now();
  fakeState().now = () => clock;
  invalidateConfigCache();
  for (const variant of ["EN_US", "EN_GB", "DE"] as const) {
    await db.tavusPal.create({
      data: {
        variant,
        palId: `p-${variant}`,
        faceId: "rface",
        basePalId: "pbase",
        palName: variant,
        specHash: "x",
        lastSyncedAt: new Date(),
      },
    });
  }
  await db.plan.createMany({
    data: PLANS.map((p) => ({
      id: p.id,
      nameEs: p.nameEs,
      priceUsdCents: p.priceUsdCents,
      monthlySeconds: p.monthlySeconds,
      perSessionCapSeconds: p.perSessionCapSeconds,
      sortOrder: p.sortOrder,
      features: p.features,
    })),
  });
  await db.topupPack.createMany({
    data: TOPUPS.map((t) => ({ id: t.id, nameEs: t.nameEs, priceUsdCents: t.priceUsdCents, seconds: t.seconds, sortOrder: t.sortOrder })),
  });
  await syncSlots();
}

function input(user: { id: string; name: string; email: string }, extra: Partial<StartInput> = {}): StartInput {
  return {
    user: { ...user, emailVerified: true },
    language: "EN_US",
    lessonId: null,
    clientRequestId: randomUUID(),
    queueEntryId: null,
    trial: { deviceId: randomUUID(), ipPrefixHash: `ip-${randomUUID()}`, captchaOk: true },
    ...extra,
  };
}

async function paidUser(seconds = 3600) {
  const u = await createTestUser();
  await withTx((tx) =>
    grantSeconds(tx, { userId: u.id, source: "PLAN_CYCLE", seconds, expiresAt: inDays(30), grantKey: `plan:${u.id}` }),
  );
  return u;
}

async function completeDiagnostic(userId: string) {
  await db.diagnosticAttempt.create({
    data: { userId, language: "EN_US", status: "COMPLETED", phase: "DONE", resultLevel: "A2", completedAt: new Date() },
  });
}

beforeEach(baseSetup);
afterAll(async () => {
  await db.$disconnect();
});

describe("ciclo de una clase pagada", () => {
  it("inicia, se conecta, termina y cobra solo lo usado", async () => {
    const u = await paidUser(3600);
    const r = await startSession(input(u));
    expect(r.kind).toBe("started");
    const sid = (r as { sessionId: string }).sessionId;

    let s = await db.tutorSession.findUniqueOrThrow({ where: { id: sid } });
    expect(s.status).toBe("READY");
    expect(s.maxCallDurationSec).toBe(900); // tope de Builder
    expect(s.reservedSeconds).toBe(920);
    expect((await getBalance(u.id)).paidAvailableSeconds).toBe(3600 - 920);

    await markJoined(sid, u.id);
    clock += 125_000; // 2:05 de clase
    await requestEnd(sid, "USER_END");

    s = await db.tutorSession.findUniqueOrThrow({ where: { id: sid } });
    expect(s.status).toBe("SETTLED");
    expect(s.billedSeconds).toBe(126); // redondeo a 6 s hacia arriba
    expect(s.chargedSeconds).toBe(126);
    expect((await getBalance(u.id)).paidAvailableSeconds).toBe(3600 - 126);
    expect(await db.concurrencySlot.count({ where: { state: "BUSY" } })).toBe(0);
    expect(await checkLedgerInvariants(u.id)).toEqual([]);
  });

  it("Tavus corta solo al llegar al tope y el vigilante liquida", async () => {
    const u = await paidUser(200); // saldo limita: clase de 180 s
    const r = await startSession(input(u));
    const sid = (r as { sessionId: string }).sessionId;
    const s0 = await db.tutorSession.findUniqueOrThrow({ where: { id: sid } });
    expect(s0.maxCallDurationSec).toBe(180);
    await markJoined(sid, u.id);
    clock += 400_000; // el navegador desaparece; Tavus corta a los 180 s
    await sweepSessions(new Date(clock));
    const s = await db.tutorSession.findUniqueOrThrow({ where: { id: sid } });
    expect(s.status).toBe("SETTLED");
    expect(s.billedSeconds).toBe(180);
    expect((await getBalance(u.id)).paidAvailableSeconds).toBe(20);
    expect(await checkLedgerInvariants(u.id)).toEqual([]);
  });

  it("cierres simultaneos (boton + webhook + vigilante) cobran una sola vez", async () => {
    const u = await paidUser(3600);
    const sid = ((await startSession(input(u))) as { sessionId: string }).sessionId;
    await markJoined(sid, u.id);
    clock += 61_000;
    await Promise.all([
      requestEnd(sid, "USER_END"),
      requestEnd(sid, "TAB_CLOSE"),
      confirmEnded(sid),
      sweepSessions(new Date(clock)),
      requestEnd(sid, "CLIENT_LEFT"),
    ]);
    await confirmEnded(sid);
    const captures = await db.ledgerEntry.count({ where: { sessionId: sid, type: "CAPTURE" } });
    expect(captures).toBe(1);
    expect((await getBalance(u.id)).paidAvailableSeconds).toBe(3600 - 66);
    expect(await checkLedgerInvariants(u.id)).toEqual([]);
  });

  it("doble clic: la misma clave de idempotencia devuelve la misma clase", async () => {
    const u = await paidUser();
    const req = input(u);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => startSession(req)));
    const ids = new Set(
      results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<{ sessionId: string }>).value.sessionId),
    );
    expect(ids.size).toBe(1);
    expect(await db.tutorSession.count({ where: { userId: u.id } })).toBe(1);
  });

  it("20 solicitudes simultaneas del mismo usuario -> una sola clase abierta", async () => {
    const u = await paidUser(36_000);
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => startSession(input(u))));
    const started = results.filter((r) => r.status === "fulfilled" && r.value.kind === "started");
    expect(started).toHaveLength(1);
    const open = results.filter((r) => r.status === "rejected" && (r.reason as SessionError).code === "SESSION_OPEN");
    expect(open.length).toBe(19);
    expect(await db.tutorSession.count({ where: { userId: u.id } })).toBe(1);
    expect(await checkLedgerInvariants(u.id)).toEqual([]);
  });

  it("si Tavus rechaza la creacion, no se cobra nada", async () => {
    const u = await paidUser(3600);
    fakeState().failNextCreate = "definite";
    await expect(startSession(input(u))).rejects.toMatchObject({ code: "TAVUS_ERROR" });
    const s = await db.tutorSession.findFirstOrThrow({ where: { userId: u.id } });
    expect(s.status).toBe("FAILED");
    expect((await getBalance(u.id)).paidAvailableSeconds).toBe(3600);
    expect(await db.concurrencySlot.count({ where: { state: "BUSY" } })).toBe(0);
  });

  it("creacion incierta: la conversacion huerfana se cierra y no se cobra", async () => {
    const u = await paidUser(3600);
    fakeState().failNextCreate = "timeout-but-created";
    await expect(startSession(input(u))).rejects.toMatchObject({ code: "TAVUS_ERROR" });
    clock += 70_000;
    await db.tutorSession.updateMany({ data: { createRequestedAt: new Date(clock - 70_000) } });
    await sweepSessions(new Date(clock + 1000));
    const s = await db.tutorSession.findFirstOrThrow({ where: { userId: u.id } });
    expect(s.status).toBe("SETTLED");
    expect(s.endReason).toBe("ORPHAN");
    expect(s.chargedSeconds).toBe(0);
    expect((await getBalance(u.id)).paidAvailableSeconds).toBe(3600);
  });

  it("el cazador cierra conversaciones de Tavus sin clase abierta", async () => {
    const u = await paidUser(3600);
    const sid = ((await startSession(input(u))) as { sessionId: string }).sessionId;
    // Simula que la base de datos "perdio" la clase (p. ej. un fallo grave).
    await db.tutorSession.update({ where: { id: sid }, data: { status: "FAILED" } });
    clock += 120_000;
    const killed = await killOrphans(new Date(clock));
    expect(killed).toHaveLength(1);
  });
});

describe("concurrencia global y cola", () => {
  it("10 usuarios con limite 3 -> 3 en clase y 7 en cola por orden", async () => {
    const users = await Promise.all(Array.from({ length: 10 }, () => paidUser(3600)));
    const results = [];
    for (const u of users) results.push(await startSession(input(u)));
    expect(results.filter((r) => r.kind === "started")).toHaveLength(3);
    const queued = results.filter((r) => r.kind === "queued") as { position: number; queueEntryId: string }[];
    expect(queued.map((q) => q.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);

    // Termina una clase: el cupo se OFRECE al primero de la fila, no queda libre.
    const first = results[0] as { sessionId: string };
    clock += 30_000;
    await requestEnd(first.sessionId, "USER_END");
    const offered = await db.concurrencySlot.findFirstOrThrow({ where: { state: "OFFERED" } });
    expect(offered.queueEntryId).toBe(queued[0].queueEntryId);

    // Alguien nuevo no se puede saltar la fila.
    const late = await paidUser(3600);
    expect((await startSession(input(late))).kind).toBe("queued");

    // El primero de la fila reclama su cupo.
    const head = users[3];
    const claimed = await startSession(input(head, { queueEntryId: queued[0].queueEntryId }));
    expect(claimed.kind).toBe("started");
  });
});

describe("vencimiento de ofertas de cupo (zona horaria)", () => {
  it("una oferta vencida pasa al siguiente de la fila", async () => {
    const users = await Promise.all(Array.from({ length: 5 }, () => paidUser(3600)));
    const results = [];
    for (const u of users) results.push(await startSession(input(u)));
    const queued = results.filter((r) => r.kind === "queued") as { queueEntryId: string }[];
    clock += 30_000;
    await requestEnd((results[0] as { sessionId: string }).sessionId, "USER_END");
    const slot = await db.concurrencySlot.findFirstOrThrow({ where: { state: "OFFERED" } });
    expect(slot.queueEntryId).toBe(queued[0].queueEntryId);
    // La primera persona de la fila no reclama a tiempo.
    await db.concurrencySlot.update({ where: { id: slot.id }, data: { offeredUntil: new Date(Date.now() - 1000) } });
    await maintainQueue();
    const after = await db.concurrencySlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(after.state).toBe("OFFERED");
    expect(after.queueEntryId).toBe(queued[1].queueEntryId);
    expect((await db.sessionQueueEntry.findUniqueOrThrow({ where: { id: queued[0].queueEntryId } })).status).toBe("EXPIRED");
  });
});

describe("prueba gratis", () => {
  it("requiere diagnostico, se usa una sola vez y lo no usado vence", async () => {
    const u = await createTestUser();
    await expect(startSession(input(u))).rejects.toMatchObject({ code: "TRIAL_NEEDS_DIAGNOSTIC" });
    await completeDiagnostic(u.id);
    const r = await startSession(input(u));
    const sid = (r as { sessionId: string }).sessionId;
    const s = await db.tutorSession.findUniqueOrThrow({ where: { id: sid } });
    expect(s.isTrial).toBe(true);
    expect(s.maxCallDurationSec).toBe(300); // 5 minutos completos
    await markJoined(sid, u.id);
    clock += 100_000;
    await requestEnd(sid, "USER_END");
    const bal = await getBalance(u.id);
    expect(bal.trialAvailableSeconds).toBe(0);
    await expect(startSession(input(u))).rejects.toMatchObject({ code: "PAYWALL" });
    expect(await checkLedgerInvariants(u.id)).toEqual([]);
  });

  it("mismo dispositivo con otra cuenta no obtiene otra prueba", async () => {
    const device = randomUUID();
    const a = await createTestUser();
    const b = await createTestUser();
    await completeDiagnostic(a.id);
    await completeDiagnostic(b.id);
    await startSession(input(a, { trial: { deviceId: device, ipPrefixHash: "ip1", captchaOk: true } }));
    await expect(
      startSession(input(b, { trial: { deviceId: device, ipPrefixHash: "ip2", captchaOk: true } })),
    ).rejects.toMatchObject({ code: "TRIAL_USED" });
  });

  it("gmail con puntos o +etiqueta cuenta como el mismo correo", async () => {
    const a = await createTestUser({ email: "ana.perez@gmail.com" });
    const b = await createTestUser({ email: "anaperez+2@gmail.com" });
    await completeDiagnostic(a.id);
    await completeDiagnostic(b.id);
    await startSession(input({ ...a, email: a.email }));
    await expect(startSession(input({ ...b, email: b.email }))).rejects.toMatchObject({ code: "TRIAL_USED" });
  });

  it("interruptor de emergencia detiene nuevas clases", async () => {
    const u = await paidUser();
    await setConfig("tavus.killSwitch", true, null);
    await expect(startSession(input(u))).rejects.toMatchObject({ code: "SERVICE_PAUSED" });
    await setConfig("tavus.killSwitch", false, null);
  });
});

describe("pagos simulados", () => {
  it("comprar un plan otorga sus minutos una sola vez y renueva al mes", async () => {
    const u = await createTestUser();
    const { url } = await fakePayments.createCheckout({ userId: u.id, kind: "plan", itemId: "fluido" });
    const params = new URL(url, "http://x").searchParams;
    const parsed = fakePayments.parseCheckout(params.get("ref")!, params.get("sig")!, u.id);
    expect(parsed?.itemId).toBe("fluido");
    expect(fakePayments.parseCheckout(params.get("ref")!, "firma-falsa", u.id)).toBeNull();

    await fakePayments.completeCheckout(params.get("ref")!, u.id);
    await fakePayments.completeCheckout(params.get("ref")!, u.id); // repetido: no duplica
    expect((await getBalance(u.id)).paidAvailableSeconds).toBe(3600);

    // Un mes despues: renovacion.
    const later = new Date(Date.now() + 32 * 86_400_000);
    expect(await runRenewals(later)).toBe(1);
    expect(await db.payment.count({ where: { userId: u.id } })).toBe(2);
    expect(await checkLedgerInvariants(u.id)).toEqual([]);
  });

  it("reembolso retira los minutos no usados", async () => {
    const u = await createTestUser();
    await applyPaymentEvent({
      type: "TOPUP_PAID",
      provider: "fake",
      eventId: "e1",
      externalPaymentId: "p1",
      userId: u.id,
      topupId: "recarga-15",
      amountUsdCents: 1900,
      feeUsdCents: 144,
    });
    expect((await getBalance(u.id)).paidAvailableSeconds).toBe(900);
    await applyPaymentEvent({ type: "PAYMENT_REFUNDED", provider: "fake", eventId: "e2", externalPaymentId: "p1" });
    expect((await getBalance(u.id)).paidAvailableSeconds).toBe(0);
    expect(await checkLedgerInvariants(u.id)).toEqual([]);
  });
});
