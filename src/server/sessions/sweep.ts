/**
 * Vigilantes (los ejecuta el worker). Garantizan que ninguna conversacion de
 * Tavus quede abierta gastando minutos aunque el navegador o el servidor fallen.
 */
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { expireUserBuckets, withTx } from "@/server/ledger/wallet";
import { tavus } from "@/server/tavus";

import {
  confirmEnded,
  failSession,
  requestEnd,
  resolveUncertainCreate,
  settleSession,
} from "./lifecycle";

const sec = (n: number) => n * 1000;

async function safe(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    console.error(`[sweep] ${label}:`, err instanceof Error ? err.message : err);
  }
}

/** Barrido general: atascos, fechas limite, ausencias y liquidaciones pendientes. */
export async function sweepSessions(now = new Date()) {
  const config = await getConfig();
  const t = now.getTime();

  // Fecha limite superada (+10 s de gracia): Tavus ya deberia haber cortado.
  const overdue = await db.tutorSession.findMany({
    where: { status: { in: ["READY", "LIVE"] }, hardDeadlineAt: { lt: new Date(t - sec(10)) } },
    select: { id: true },
  });
  for (const s of overdue) await safe(`deadline ${s.id}`, () => requestEnd(s.id, "DEADLINE"));

  // Nunca entro a la llamada.
  const noShow = await db.tutorSession.findMany({
    where: {
      status: "READY",
      joinedAt: null,
      createRequestedAt: { lt: new Date(t - sec(config["session.participantAbsentTimeout"] + 30)) },
    },
    select: { id: true },
  });
  for (const s of noShow) await safe(`no-show ${s.id}`, () => requestEnd(s.id, "NO_SHOW"));

  // Sin latido del navegador: si Tavus sigue activo, se corta.
  const stale = await db.tutorSession.findMany({
    where: { status: "LIVE", lastHeartbeatAt: { lt: new Date(t - sec(config["session.heartbeatStaleSeconds"])) } },
    select: { id: true },
  });
  for (const s of stale) {
    await safe(`heartbeat ${s.id}`, async () => {
      if (!(await confirmEnded(s.id))) await requestEnd(s.id, "HEARTBEAT_LOST");
    });
  }

  // Cierres pedidos que Tavus aun no confirma.
  const ending = await db.tutorSession.findMany({
    where: { status: "ENDING", endRequestedAt: { lt: new Date(t - sec(15)) } },
    select: { id: true, tavusConversationId: true },
  });
  for (const s of ending) {
    await safe(`ending ${s.id}`, async () => {
      if (s.tavusConversationId) await tavus().endConversation(s.tavusConversationId);
      await confirmEnded(s.id);
    });
  }

  // Terminadas sin liquidar.
  const ended = await db.tutorSession.findMany({ where: { status: "ENDED" }, select: { id: true } });
  for (const s of ended) await safe(`settle ${s.id}`, () => settleSession(s.id));

  // Reservas que nunca llegaron a Tavus.
  const reserved = await db.tutorSession.findMany({
    where: { status: "RESERVED", createdAt: { lt: new Date(t - sec(30)) } },
    select: { id: true },
  });
  for (const s of reserved) await safe(`reserved ${s.id}`, () => failSession(s.id, "stuck_reserved"));

  // Creaciones inciertas (timeout al crear).
  const creating = await db.tutorSession.findMany({
    where: { status: "CREATING", createRequestedAt: { lt: new Date(t - sec(60)) } },
    select: { id: true },
  });
  for (const s of creating) await safe(`creating ${s.id}`, () => resolveUncertainCreate(s.id));
}

/** Consulta a Tavus las clases abiertas (en local no llegan webhooks). */
export async function pollActiveSessions() {
  const open = await db.tutorSession.findMany({
    where: { status: { in: ["READY", "LIVE", "ENDING"] }, tavusConversationId: { not: null } },
    select: { id: true },
  });
  for (const s of open) await safe(`poll ${s.id}`, () => confirmEnded(s.id));
}

/**
 * Cazador de huerfanas: cualquier conversacion activa en Tavus con nombre
 * "mypal:<id>" que no corresponda a una clase abierta se termina.
 */
export async function killOrphans(now = new Date()): Promise<string[]> {
  const killed: string[] = [];
  const active = await tavus().listConversations({ status: "active", limit: 100 });
  for (const c of active) {
    const name = c.conversation_name ?? "";
    if (!name.startsWith("mypal:") || name.startsWith("mypal:verify")) continue;
    const created = c.created_at ? new Date(c.created_at).getTime() : 0;
    if (now.getTime() - created < sec(90)) continue;
    const sessionId = name.slice("mypal:".length);
    const s = await db.tutorSession.findUnique({ where: { id: sessionId }, select: { status: true } });
    const isOpen = s && ["CREATING", "READY", "LIVE", "ENDING"].includes(s.status);
    if (isOpen) continue;
    await safe(`orphan ${c.conversation_id}`, () => tavus().endConversation(c.conversation_id));
    killed.push(c.conversation_id);
    console.warn(`[sweep] conversacion huerfana terminada: ${c.conversation_id} (${name})`);
  }
  return killed;
}

/** Vence la parte disponible de cubos vencidos. */
export async function expireBuckets(now = new Date()) {
  const users = await db.minuteBucket.findMany({
    where: { expiresAt: { lte: now } },
    select: { userId: true, grantedSeconds: true, heldSeconds: true, consumedSeconds: true, expiredSeconds: true },
  });
  const pending = new Set(
    users.filter((b) => b.grantedSeconds - b.heldSeconds - b.consumedSeconds - b.expiredSeconds > 0).map((b) => b.userId),
  );
  for (const userId of pending) await safe(`expire ${userId}`, () => withTx((tx) => expireUserBuckets(tx, userId, now)));
  return pending.size;
}
