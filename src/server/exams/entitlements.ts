/**
 * Cupos de examen por periodo (simulacros, correcciones de Writing, partes de Speaking).
 * Mismo patron que los minutos: reservar al empezar, consumir al terminar, devolver si
 * falla algo de nuestro lado. La base de datos impide usar mas de lo otorgado (CHECK).
 */
import type { ExamQuotaKind } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { withTx, type Tx } from "@/server/ledger/wallet";

export class QuotaError extends Error {
  constructor(
    readonly kind: ExamQuotaKind,
    message: string,
  ) {
    super(message);
    this.name = "QuotaError";
  }
}

const KIND_ES: Record<ExamQuotaKind, string> = {
  MOCK: "simulacros completos",
  WRITING: "correcciones de Writing",
  SPEAKING: "partes de Speaking",
};

async function lockUser(tx: Tx, userId: string) {
  // Serializa las operaciones de cupo de un usuario (reutiliza la fila de la billetera).
  await tx.$executeRaw`
    INSERT INTO "MinuteWallet" ("userId", "availableSeconds", "heldSeconds", "updatedAt")
    VALUES (${userId}, 0, 0, now()) ON CONFLICT ("userId") DO NOTHING`;
  await tx.$queryRaw`SELECT 1 FROM "MinuteWallet" WHERE "userId" = ${userId} FOR UPDATE`;
}

async function event(
  tx: Tx,
  e: { entitlementId: string; userId: string; kind: ExamQuotaKind; type: string; amount: number; attemptId?: string | null; key: string },
) {
  const exists = await tx.examUsageEvent.findUnique({ where: { idempotencyKey: e.key }, select: { id: true } });
  if (exists) return false;
  await tx.examUsageEvent.create({
    data: {
      entitlementId: e.entitlementId,
      userId: e.userId,
      kind: e.kind,
      type: e.type,
      amount: e.amount,
      attemptId: e.attemptId ?? null,
      idempotencyKey: e.key,
    },
  });
  return true;
}

export interface GrantInput {
  userId: string;
  kind: ExamQuotaKind;
  amount: number;
  periodStart: Date;
  periodEnd: Date;
  sourceKey: string;
}

export async function grantQuota(input: GrantInput) {
  if (input.amount <= 0) return null;
  return withTx((tx) => grantQuotaTx(tx, input));
}

/** Igual que grantQuota pero dentro de una transaccion ya abierta (p. ej. al aplicar un pago). */
export async function grantQuotaTx(tx: Tx, input: GrantInput) {
  if (input.amount <= 0) return null;
  {
    await lockUser(tx, input.userId);
    const existing = await tx.examEntitlement.findUnique({ where: { sourceKey: input.sourceKey } });
    if (existing) return existing;
    const ent = await tx.examEntitlement.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        granted: input.amount,
        sourceKey: input.sourceKey,
      },
    });
    await event(tx, { entitlementId: ent.id, userId: input.userId, kind: input.kind, type: "GRANT", amount: input.amount, key: `grant:${input.sourceKey}` });
    return ent;
  }
}

/** Reembolso: lo no usado de los cupos de un pago deja de estar disponible. */
export async function revokeQuotasTx(tx: Tx, userId: string, sourcePrefix: string) {
  await lockUser(tx, userId);
  const ents = await tx.examEntitlement.findMany({ where: { userId, sourceKey: { startsWith: sourcePrefix } } });
  for (const e of ents) {
    const keep = e.used + e.reserved;
    if (keep >= e.granted) continue;
    await tx.examEntitlement.update({ where: { id: e.id }, data: { granted: keep } });
    await event(tx, { entitlementId: e.id, userId, kind: e.kind, type: "REVOKE", amount: e.granted - keep, key: `revoke:${e.sourceKey}` });
  }
}

export async function quotaSummary(userId: string, now = new Date()) {
  const rows = await db.examEntitlement.findMany({
    where: { userId, periodStart: { lte: now }, periodEnd: { gt: now } },
  });
  const out: Record<ExamQuotaKind, { granted: number; used: number; reserved: number; available: number }> = {
    MOCK: { granted: 0, used: 0, reserved: 0, available: 0 },
    WRITING: { granted: 0, used: 0, reserved: 0, available: 0 },
    SPEAKING: { granted: 0, used: 0, reserved: 0, available: 0 },
  };
  for (const r of rows) {
    const o = out[r.kind];
    o.granted += r.granted;
    o.used += r.used;
    o.reserved += r.reserved;
    o.available += r.granted - r.used - r.reserved;
  }
  return out;
}

/**
 * Reserva 1 unidad. `unlimited` (administradores) no consume cupo: su uso se registra
 * como costo interno en AiUsage, no en los productos.
 */
export async function reserveQuota(input: { userId: string; kind: ExamQuotaKind; refId: string; unlimited?: boolean; now?: Date }) {
  if (input.unlimited) return { entitlementId: null };
  const now = input.now ?? new Date();
  return withTx(async (tx) => {
    await lockUser(tx, input.userId);
    const already = await tx.examUsageEvent.findUnique({ where: { idempotencyKey: `reserve:${input.kind}:${input.refId}` } });
    if (already) return { entitlementId: already.entitlementId };
    const candidates = await tx.examEntitlement.findMany({
      where: { userId: input.userId, kind: input.kind, periodStart: { lte: now }, periodEnd: { gt: now } },
      orderBy: { periodEnd: "asc" },
    });
    const ent = candidates.find((c) => c.granted - c.used - c.reserved > 0);
    if (!ent) throw new QuotaError(input.kind, `No te quedan ${KIND_ES[input.kind]} en este periodo.`);
    await tx.examEntitlement.update({ where: { id: ent.id }, data: { reserved: { increment: 1 } } });
    await event(tx, { entitlementId: ent.id, userId: input.userId, kind: input.kind, type: "RESERVE", amount: 1, attemptId: input.refId, key: `reserve:${input.kind}:${input.refId}` });
    return { entitlementId: ent.id };
  });
}

/** Convierte la reserva en consumo (idempotente). */
export async function consumeQuota(input: { userId: string; kind: ExamQuotaKind; refId: string }) {
  await withTx(async (tx) => {
    await lockUser(tx, input.userId);
    const res = await tx.examUsageEvent.findUnique({ where: { idempotencyKey: `reserve:${input.kind}:${input.refId}` } });
    if (!res) return;
    const done = await tx.examUsageEvent.findFirst({
      where: { idempotencyKey: { in: [`consume:${input.kind}:${input.refId}`, `release:${input.kind}:${input.refId}`] } },
    });
    if (done) return;
    await tx.examEntitlement.update({ where: { id: res.entitlementId }, data: { reserved: { decrement: 1 }, used: { increment: 1 } } });
    await event(tx, { entitlementId: res.entitlementId, userId: input.userId, kind: input.kind, type: "CONSUME", amount: 1, attemptId: input.refId, key: `consume:${input.kind}:${input.refId}` });
  });
}

/** Devuelve la reserva (falla de nuestro lado o abandono temprano). Idempotente. */
export async function releaseQuota(input: { userId: string; kind: ExamQuotaKind; refId: string }) {
  await withTx(async (tx) => {
    await lockUser(tx, input.userId);
    const res = await tx.examUsageEvent.findUnique({ where: { idempotencyKey: `reserve:${input.kind}:${input.refId}` } });
    if (!res) return;
    const done = await tx.examUsageEvent.findFirst({
      where: { idempotencyKey: { in: [`consume:${input.kind}:${input.refId}`, `release:${input.kind}:${input.refId}`] } },
    });
    if (done) return;
    await tx.examEntitlement.update({ where: { id: res.entitlementId }, data: { reserved: { decrement: 1 } } });
    await event(tx, { entitlementId: res.entitlementId, userId: input.userId, kind: input.kind, type: "RELEASE", amount: 1, attemptId: input.refId, key: `release:${input.kind}:${input.refId}` });
  });
}
