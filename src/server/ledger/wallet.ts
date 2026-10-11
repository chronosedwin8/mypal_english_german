/**
 * Operaciones de minutos sobre la base de datos.
 *
 * Reglas:
 *  - Toda operacion bloquea primero la billetera del usuario (SELECT ... FOR UPDATE),
 *    asi las operaciones de un mismo usuario quedan serializadas.
 *  - Cada movimiento escribe una fila de LedgerEntry con clave de idempotencia unica.
 *    Repetir una operacion no duplica movimientos.
 *  - La base de datos impide saldos negativos (CHECKs) aunque el codigo fallara.
 */
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

import {
  BUCKET_PRIORITY,
  allocate,
  availableIn,
  eligibleBuckets,
  planSettlement,
  type BucketSourceName,
  type BucketView,
} from "./allocate";

export type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Transacciones con reintento
// ---------------------------------------------------------------------------

function isRetryable(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string } } | null;
  if (!e) return false;
  if (e.code === "P2034") return true;
  const text = `${e.code ?? ""} ${e.cause?.code ?? ""} ${e.message ?? ""}`;
  return /40001|40P01|deadlock detected|could not serialize/i.test(text);
}

export async function withTx<T>(
  fn: (tx: Tx) => Promise<T>,
  opts: { attempts?: number; timeoutMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 4;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "ReadCommitted",
        maxWait: 5_000,
        timeout: opts.timeoutMs ?? 10_000,
      });
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 25 * 2 ** i + Math.random() * 25));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Billetera
// ---------------------------------------------------------------------------

/** Crea la billetera si falta y la bloquea hasta el fin de la transaccion. */
export async function lockWallet(tx: Tx, userId: string) {
  await tx.$executeRaw`
    INSERT INTO "MinuteWallet" ("userId", "availableSeconds", "heldSeconds", "updatedAt")
    VALUES (${userId}, 0, 0, now())
    ON CONFLICT ("userId") DO NOTHING`;
  const rows = await tx.$queryRaw<{ availableSeconds: number; heldSeconds: number }[]>`
    SELECT "availableSeconds", "heldSeconds" FROM "MinuteWallet" WHERE "userId" = ${userId} FOR UPDATE`;
  return rows[0];
}

async function moveWallet(tx: Tx, userId: string, deltaAvailable: number, deltaHeld: number) {
  if (deltaAvailable === 0 && deltaHeld === 0) return;
  await tx.minuteWallet.update({
    where: { userId },
    data: {
      availableSeconds: { increment: deltaAvailable },
      heldSeconds: { increment: deltaHeld },
    },
  });
}

interface LedgerInput {
  userId: string;
  bucketId: string;
  sessionId?: string | null;
  type: "GRANT" | "HOLD" | "CAPTURE" | "RELEASE" | "EXPIRE" | "CLAWBACK" | "ADJUST";
  seconds: number;
  deltaAvailable: number;
  deltaHeld: number;
  idempotencyKey: string;
  reason?: string | null;
  actorUserId?: string | null;
}

/** Inserta un movimiento. Devuelve false si la clave ya existia (no hace nada). */
async function writeLedger(tx: Tx, entry: LedgerInput): Promise<boolean> {
  if (entry.seconds <= 0) return false;
  const exists = await tx.ledgerEntry.findUnique({
    where: { idempotencyKey: entry.idempotencyKey },
    select: { id: true },
  });
  if (exists) return false;
  await tx.ledgerEntry.create({
    data: {
      userId: entry.userId,
      bucketId: entry.bucketId,
      sessionId: entry.sessionId ?? null,
      type: entry.type,
      seconds: entry.seconds,
      deltaAvailable: entry.deltaAvailable,
      deltaHeld: entry.deltaHeld,
      idempotencyKey: entry.idempotencyKey,
      reason: entry.reason ?? null,
      actorUserId: entry.actorUserId ?? null,
    },
  });
  return true;
}

function toView(b: {
  id: string;
  source: string;
  priority: number;
  grantedSeconds: number;
  heldSeconds: number;
  consumedSeconds: number;
  expiredSeconds: number;
  validFrom: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}): BucketView {
  return { ...b, source: b.source as BucketSourceName };
}

// ---------------------------------------------------------------------------
// Otorgar minutos
// ---------------------------------------------------------------------------

export interface GrantInput {
  userId: string;
  source: BucketSourceName;
  seconds: number;
  expiresAt: Date;
  validFrom?: Date;
  /** Clave unica del otorgamiento: "plan:<pagoId>", "topup:<pagoId>", "trial:<userId>"... */
  grantKey: string;
  paymentId?: string | null;
  subscriptionId?: string | null;
  actorUserId?: string | null;
  reason?: string | null;
}

export async function grantSeconds(tx: Tx, input: GrantInput) {
  if (!Number.isInteger(input.seconds) || input.seconds <= 0) {
    throw new Error(`Segundos invalidos: ${input.seconds}`);
  }
  await lockWallet(tx, input.userId);
  const existing = await tx.minuteBucket.findUnique({ where: { grantKey: input.grantKey } });
  if (existing) return { bucket: existing, created: false };

  const bucket = await tx.minuteBucket.create({
    data: {
      userId: input.userId,
      source: input.source,
      priority: BUCKET_PRIORITY[input.source],
      grantedSeconds: input.seconds,
      validFrom: input.validFrom ?? new Date(),
      expiresAt: input.expiresAt,
      grantKey: input.grantKey,
      paymentId: input.paymentId ?? null,
      subscriptionId: input.subscriptionId ?? null,
    },
  });
  await writeLedger(tx, {
    userId: input.userId,
    bucketId: bucket.id,
    type: "GRANT",
    seconds: input.seconds,
    deltaAvailable: input.seconds,
    deltaHeld: 0,
    idempotencyKey: `grant:${input.grantKey}`,
    reason: input.reason ?? input.source,
    actorUserId: input.actorUserId,
  });
  await moveWallet(tx, input.userId, input.seconds, 0);
  return { bucket, created: true };
}

// ---------------------------------------------------------------------------
// Saldo
// ---------------------------------------------------------------------------

export async function loadBuckets(tx: Tx | typeof db, userId: string): Promise<BucketView[]> {
  const rows = await tx.minuteBucket.findMany({ where: { userId } });
  return rows.map(toView);
}

export interface BalanceSummary {
  /** Minutos pagados utilizables ahora (plan + admin + recargas). */
  paidAvailableSeconds: number;
  /** Prueba gratis aun sin usar. */
  trialAvailableSeconds: number;
  heldSeconds: number;
  buckets: {
    id: string;
    source: BucketSourceName;
    availableSeconds: number;
    grantedSeconds: number;
    expiresAt: Date;
  }[];
}

export function summarize(buckets: BucketView[], now: Date): BalanceSummary {
  const paid = eligibleBuckets(buckets, { isTrial: false, now });
  const trial = eligibleBuckets(buckets, { isTrial: true, now });
  return {
    paidAvailableSeconds: paid.reduce((s, b) => s + availableIn(b), 0),
    trialAvailableSeconds: trial.reduce((s, b) => s + availableIn(b), 0),
    heldSeconds: buckets.reduce((s, b) => s + b.heldSeconds, 0),
    buckets: [...paid, ...trial].map((b) => ({
      id: b.id,
      source: b.source,
      availableSeconds: availableIn(b),
      grantedSeconds: b.grantedSeconds,
      expiresAt: b.expiresAt,
    })),
  };
}

export async function getBalance(userId: string, now = new Date()): Promise<BalanceSummary> {
  return summarize(await loadBuckets(db, userId), now);
}

// ---------------------------------------------------------------------------
// Retener (al iniciar una clase)
// ---------------------------------------------------------------------------

export async function placeHold(
  tx: Tx,
  input: { userId: string; sessionId: string; isTrial: boolean; seconds: number; now: Date },
) {
  await lockWallet(tx, input.userId);
  const buckets = await loadBuckets(tx, input.userId);
  const ordered = eligibleBuckets(buckets, { isTrial: input.isTrial, now: input.now });
  const allocations = allocate(ordered, input.seconds);

  for (const a of allocations) {
    await tx.minuteBucket.update({
      where: { id: a.bucketId },
      data: { heldSeconds: { increment: a.seconds } },
    });
    await tx.sessionHold.create({
      data: {
        sessionId: input.sessionId,
        bucketId: a.bucketId,
        allocOrder: a.allocOrder,
        heldSeconds: a.seconds,
      },
    });
    await writeLedger(tx, {
      userId: input.userId,
      bucketId: a.bucketId,
      sessionId: input.sessionId,
      type: "HOLD",
      seconds: a.seconds,
      deltaAvailable: -a.seconds,
      deltaHeld: a.seconds,
      idempotencyKey: `hold:${input.sessionId}:${a.bucketId}`,
    });
  }
  await moveWallet(tx, input.userId, -input.seconds, input.seconds);
  return allocations;
}

// ---------------------------------------------------------------------------
// Liquidar (al terminar una clase) — idempotente
// ---------------------------------------------------------------------------

export interface SettleResult {
  capturedSeconds: number;
  releasedSeconds: number;
  expiredAfterSeconds: number;
  overrunCollectedSeconds: number;
  uncollectedSeconds: number;
}

export async function settleSessionHolds(
  tx: Tx,
  input: { userId: string; sessionId: string; chargeSeconds: number; now: Date },
): Promise<SettleResult> {
  const { userId, sessionId, now } = input;
  await lockWallet(tx, userId);
  const holds = await tx.sessionHold.findMany({
    where: { sessionId },
    include: { bucket: true },
    orderBy: { allocOrder: "asc" },
  });
  const plan = planSettlement(holds, input.chargeSeconds);
  const result: SettleResult = {
    capturedSeconds: 0,
    releasedSeconds: 0,
    expiredAfterSeconds: 0,
    overrunCollectedSeconds: 0,
    uncollectedSeconds: 0,
  };
  let dAvail = 0;
  let dHeld = 0;

  for (const c of plan.captures) {
    const wrote = await writeLedger(tx, {
      userId,
      bucketId: c.bucketId,
      sessionId,
      type: "CAPTURE",
      seconds: c.seconds,
      deltaAvailable: 0,
      deltaHeld: -c.seconds,
      idempotencyKey: `capture:${sessionId}:${c.bucketId}`,
    });
    if (!wrote) continue;
    await tx.minuteBucket.update({
      where: { id: c.bucketId },
      data: { heldSeconds: { decrement: c.seconds }, consumedSeconds: { increment: c.seconds } },
    });
    await tx.sessionHold.update({
      where: { sessionId_bucketId: { sessionId, bucketId: c.bucketId } },
      data: { capturedSeconds: { increment: c.seconds } },
    });
    dHeld -= c.seconds;
    result.capturedSeconds += c.seconds;
  }

  for (const r of plan.releases) {
    const wrote = await writeLedger(tx, {
      userId,
      bucketId: r.bucketId,
      sessionId,
      type: "RELEASE",
      seconds: r.seconds,
      deltaAvailable: r.seconds,
      deltaHeld: -r.seconds,
      idempotencyKey: `release:${sessionId}:${r.bucketId}`,
    });
    if (!wrote) continue;
    await tx.minuteBucket.update({
      where: { id: r.bucketId },
      data: { heldSeconds: { decrement: r.seconds } },
    });
    await tx.sessionHold.update({
      where: { sessionId_bucketId: { sessionId, bucketId: r.bucketId } },
      data: { releasedSeconds: { increment: r.seconds } },
    });
    dAvail += r.seconds;
    dHeld -= r.seconds;
    result.releasedSeconds += r.seconds;

    // Lo liberado de un cubo vencido, revocado o de prueba (un solo uso) vence ya.
    const bucket = holds.find((h) => h.bucketId === r.bucketId)!.bucket;
    if (bucket.expiresAt <= now || bucket.revokedAt || bucket.source === "TRIAL") {
      await writeLedger(tx, {
        userId,
        bucketId: r.bucketId,
        sessionId,
        type: "EXPIRE",
        seconds: r.seconds,
        deltaAvailable: -r.seconds,
        deltaHeld: 0,
        idempotencyKey: `expire-after:${sessionId}:${r.bucketId}`,
        reason: bucket.source === "TRIAL" ? "prueba de un solo uso" : "cubo vencido o revocado",
      });
      await tx.minuteBucket.update({
        where: { id: r.bucketId },
        data: { expiredSeconds: { increment: r.seconds } },
      });
      dAvail -= r.seconds;
      result.expiredAfterSeconds += r.seconds;
    }
  }

  // Exceso (no deberia ocurrir: max_call_duration < reserva). Se cobra de otros
  // cubos pagados disponibles; lo que no alcance queda como "no cobrado".
  const alreadyCaptured = holds.reduce((s, h) => s + h.capturedSeconds, 0);
  const isFirstSettlement = alreadyCaptured === 0 && holds.every((h) => h.releasedSeconds === 0);
  if (plan.overrunSeconds > 0 && isFirstSettlement) {
    const holdBucketIds = new Set(holds.map((h) => h.bucketId));
    const isTrial = holds.some((h) => h.bucket.source === "TRIAL");
    const candidates = isTrial
      ? []
      : eligibleBuckets(await loadBuckets(tx, userId), { isTrial: false, now }).filter(
          (b) => !holdBucketIds.has(b.id),
        );
    let remaining = plan.overrunSeconds;
    for (const b of candidates) {
      if (remaining <= 0) break;
      const take = Math.min(availableIn(b), remaining);
      if (take <= 0) continue;
      const wrote = await writeLedger(tx, {
        userId,
        bucketId: b.id,
        sessionId,
        type: "CAPTURE",
        seconds: take,
        deltaAvailable: -take,
        deltaHeld: 0,
        idempotencyKey: `overrun:${sessionId}:${b.id}`,
        reason: "exceso sobre la reserva",
      });
      if (!wrote) continue;
      await tx.minuteBucket.update({ where: { id: b.id }, data: { consumedSeconds: { increment: take } } });
      dAvail -= take;
      remaining -= take;
      result.overrunCollectedSeconds += take;
    }
    result.uncollectedSeconds = remaining;
  }

  await moveWallet(tx, userId, dAvail, dHeld);
  return result;
}

// ---------------------------------------------------------------------------
// Vencimientos y reembolsos
// ---------------------------------------------------------------------------

/** Vence la parte DISPONIBLE de cubos vencidos (lo retenido vence al liquidar). */
export async function expireUserBuckets(tx: Tx, userId: string, now: Date): Promise<number> {
  await lockWallet(tx, userId);
  const rows = await tx.minuteBucket.findMany({
    where: { userId, expiresAt: { lte: now } },
  });
  let total = 0;
  for (const b of rows) {
    const avail = availableIn(b);
    if (avail <= 0) continue;
    const wrote = await writeLedger(tx, {
      userId,
      bucketId: b.id,
      type: "EXPIRE",
      seconds: avail,
      deltaAvailable: -avail,
      deltaHeld: 0,
      idempotencyKey: `expire:${b.id}:${b.expiredSeconds}`,
      reason: "vencimiento",
    });
    if (!wrote) continue;
    await tx.minuteBucket.update({ where: { id: b.id }, data: { expiredSeconds: { increment: avail } } });
    total += avail;
  }
  await moveWallet(tx, userId, -total, 0);
  return total;
}

/** Reembolso o contracargo: revoca el cubo y retira lo que no se ha usado. */
export async function revokeBucket(
  tx: Tx,
  input: { userId: string; bucketId: string; reason: string; actorUserId?: string | null; now: Date },
): Promise<number> {
  await lockWallet(tx, input.userId);
  const b = await tx.minuteBucket.findUniqueOrThrow({ where: { id: input.bucketId } });
  if (b.userId !== input.userId) throw new Error("El cubo no pertenece al usuario");
  if (!b.revokedAt) {
    await tx.minuteBucket.update({ where: { id: b.id }, data: { revokedAt: input.now } });
  }
  const avail = availableIn(b);
  if (avail <= 0) return 0;
  const wrote = await writeLedger(tx, {
    userId: input.userId,
    bucketId: b.id,
    type: "CLAWBACK",
    seconds: avail,
    deltaAvailable: -avail,
    deltaHeld: 0,
    idempotencyKey: `clawback:${b.id}:${b.expiredSeconds}`,
    reason: input.reason,
    actorUserId: input.actorUserId,
  });
  if (!wrote) return 0;
  await tx.minuteBucket.update({ where: { id: b.id }, data: { expiredSeconds: { increment: avail } } });
  await moveWallet(tx, input.userId, -avail, 0);
  return avail;
}

// ---------------------------------------------------------------------------
// Invariantes (chequeo nocturno y tests)
// ---------------------------------------------------------------------------

export interface InvariantViolation {
  userId: string;
  check: string;
  expected: number;
  actual: number;
}

export async function checkLedgerInvariants(userId?: string): Promise<InvariantViolation[]> {
  const filter = userId ? { userId } : {};
  const [wallets, buckets, ledger, holds] = await Promise.all([
    db.minuteWallet.findMany({ where: filter }),
    db.minuteBucket.groupBy({
      by: ["userId"],
      where: filter,
      _sum: { grantedSeconds: true, heldSeconds: true, consumedSeconds: true, expiredSeconds: true },
    }),
    db.ledgerEntry.groupBy({
      by: ["userId"],
      where: filter,
      _sum: { deltaAvailable: true, deltaHeld: true },
    }),
    db.sessionHold.findMany({
      where: userId ? { session: { userId } } : {},
      select: { heldSeconds: true, capturedSeconds: true, releasedSeconds: true, session: { select: { userId: true } } },
    }),
  ]);

  const out: InvariantViolation[] = [];
  const openHoldByUser = new Map<string, number>();
  for (const h of holds) {
    const open = h.heldSeconds - h.capturedSeconds - h.releasedSeconds;
    openHoldByUser.set(h.session.userId, (openHoldByUser.get(h.session.userId) ?? 0) + open);
  }

  for (const w of wallets) {
    const b = buckets.find((x) => x.userId === w.userId)?._sum;
    const l = ledger.find((x) => x.userId === w.userId)?._sum;
    const bucketAvail =
      (b?.grantedSeconds ?? 0) - (b?.heldSeconds ?? 0) - (b?.consumedSeconds ?? 0) - (b?.expiredSeconds ?? 0);
    const checks: [string, number, number][] = [
      ["wallet.available == Σ cubos disponibles", bucketAvail, w.availableSeconds],
      ["wallet.held == Σ cubos retenidos", b?.heldSeconds ?? 0, w.heldSeconds],
      ["wallet.available == Σ ledger.deltaAvailable", l?.deltaAvailable ?? 0, w.availableSeconds],
      ["wallet.held == Σ ledger.deltaHeld", l?.deltaHeld ?? 0, w.heldSeconds],
      ["wallet.held == Σ retenciones abiertas", openHoldByUser.get(w.userId) ?? 0, w.heldSeconds],
    ];
    for (const [check, expected, actual] of checks) {
      if (expected !== actual) out.push({ userId: w.userId, check, expected, actual });
    }
  }
  return out;
}
