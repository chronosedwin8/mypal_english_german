/**
 * Ciclo de vida de una clase con el tutor (el nucleo del margen).
 *
 *   RESERVED -> CREATING -> READY -> LIVE -> ENDING -> ENDED -> SETTLED
 *                     \-> FAILED (se libera todo, no se cobra)
 *
 * Reglas:
 *  - Cada cambio de estado es un compare-and-set: UPDATE ... WHERE status IN (...).
 *    Si no afecta filas, otro proceso ya lo hizo: se relee y se sale.
 *  - Nunca hay llamadas HTTP dentro de una transaccion.
 *  - El dinero solo se mueve cuando Tavus CONFIRMA que la conversacion termino.
 *  - Reloj unico para cobrar: inicio y fin de Tavus, o los dos nuestros.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type { Audience, Cefr, EndReason, SessionStatus, TargetLang } from "@/generated/prisma/client";
import { planById } from "@/lib/pricing/catalog";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { eligibleBuckets, totalAvailable } from "@/server/ledger/allocate";
import { loadBuckets, lockWallet, placeHold, settleSessionHolds, withTx, type Tx } from "@/server/ledger/wallet";
import { billedSecondsFromDuration, computeReserve, costMicroUsd } from "@/server/metering/billing-math";
import { TavusApiError, tavus, type TavusConversationDetail } from "@/server/tavus";
import { claimTrial, type TrialRequest } from "@/server/trial/claim";

import { buildContext } from "./context";
import { SessionError } from "./errors";

const OPEN: SessionStatus[] = ["RESERVED", "CREATING", "READY", "LIVE", "ENDING"];

// ---------------------------------------------------------------------------
// Tokens firmados (webhook y cierre por sendBeacon)
// ---------------------------------------------------------------------------

function secret() {
  const s = process.env.TAVUS_WEBHOOK_SECRET;
  if (!s) throw new Error("Falta TAVUS_WEBHOOK_SECRET en .env");
  return s;
}

export function signSession(sessionId: string, purpose: "webhook" | "end"): string {
  return createHmac("sha256", secret()).update(`${purpose}:${sessionId}`).digest("base64url").slice(0, 32);
}

export function verifySessionSignature(sessionId: string, purpose: "webhook" | "end", sig: string): boolean {
  const expected = Buffer.from(signSession(sessionId, purpose));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

export interface StartInput {
  user: { id: string; name: string; email: string; emailVerified: boolean };
  language: TargetLang;
  audience?: Audience;
  lessonId: string | null;
  clientRequestId: string;
  queueEntryId: string | null;
  trial: Omit<TrialRequest, "userId" | "email" | "emailVerified"> & { captchaOk: boolean };
}

export type StartResult =
  | { kind: "started"; sessionId: string }
  | { kind: "existing"; sessionId: string }
  | { kind: "queued"; queueEntryId: string; position: number };

class NoSlotError extends Error {}

export async function startSession(input: StartInput): Promise<StartResult> {
  const config = await getConfig({ fresh: true });
  if (config["tavus.killSwitch"]) {
    throw new SessionError("SERVICE_PAUSED", "Las clases están en pausa por mantenimiento. Vuelve en unos minutos.");
  }
  const audience: Audience = input.audience ?? "ADULT";
  const kids = audience === "KIDS";
  const pal = await db.tavusPal.findUnique({ where: { variant_audience: { variant: input.language, audience } } });
  if (!pal) throw new SessionError("NOT_CONFIGURED", "El tutor de este idioma aún no está configurado (pnpm tavus:setup).");

  const profile = await db.languageProfile.findUnique({
    where: { userId_language: { userId: input.user.id, language: input.language } },
  });
  const lesson = input.lessonId ? await db.lesson.findUnique({ where: { id: input.lessonId }, select: { id: true } }) : null;
  const now = new Date();
  const sessionId = randomUUID();
  const testMode = false;

  let reserved: { reserveSeconds: number; maxCallDurationSeconds: number; isTrial: boolean } | null = null;
  try {
    const outcome = await withTx(async (tx) => {
      await lockWallet(tx, input.user.id);

      const dup = await tx.tutorSession.findUnique({
        where: { userId_clientRequestId: { userId: input.user.id, clientRequestId: input.clientRequestId } },
        select: { id: true },
      });
      if (dup) return { kind: "existing" as const, sessionId: dup.id };

      const open = await tx.tutorSession.findFirst({
        where: { userId: input.user.id, status: { in: OPEN } },
        select: { id: true },
      });
      if (open) throw new SessionError("SESSION_OPEN", "Ya tienes una clase abierta.", { sessionId: open.id });

      await assertMonthlyBudget(tx, config["tavus.monthlyBudgetSeconds"]);

      // ¿Pagada o prueba?
      const buckets = await loadBuckets(tx, input.user.id);
      const paid = totalAvailable(eligibleBuckets(buckets, { isTrial: false, now }));
      const sub = await tx.subscription.findFirst({
        where: { userId: input.user.id, kind: "TUTOR", status: { in: ["ACTIVE", "PAST_DUE"] } },
        select: { planId: true },
      });
      const basePlanCap = sub ? (planById(sub.planId)?.perSessionCapSeconds ?? config["tavus.planMaxSessionSeconds"]) : config["tavus.planMaxSessionSeconds"];
      const planCap = kids ? Math.min(basePlanCap, config["kids.maxSessionSeconds"]) : basePlanCap;
      const common = {
        tavusPlanMaxSeconds: config["tavus.planMaxSessionSeconds"],
        safetyMarginSeconds: config["session.safetyMarginSeconds"],
        minStartSeconds: config["session.minStartSeconds"],
      };

      let isTrial = false;
      let reserve = computeReserve({ ...common, availableSeconds: paid, perSessionCapSeconds: planCap });
      if (!reserve.ok) {
        let trialAvail = totalAvailable(eligibleBuckets(buckets, { isTrial: true, now }));
        if (trialAvail === 0) {
          if (paid > 0 || sub) {
            throw new SessionError("INSUFFICIENT_BALANCE", "Te quedan muy pocos minutos. Recarga para seguir practicando.");
          }
          if (!input.trial.captchaOk) throw new SessionError("CAPTCHA_REQUIRED", "Completa la verificación de seguridad.");
          await claimTrial(
            tx,
            {
              userId: input.user.id,
              email: input.user.email,
              emailVerified: input.user.emailVerified,
              deviceId: input.trial.deviceId,
              ipPrefixHash: input.trial.ipPrefixHash,
            },
            kids ? { ...config, "trial.requireDiagnostic": false } : config,
            now,
          );
          trialAvail = totalAvailable(eligibleBuckets(await loadBuckets(tx, input.user.id), { isTrial: true, now }));
        }
        isTrial = true;
        reserve = computeReserve({ ...common, availableSeconds: trialAvail, perSessionCapSeconds: config["trial.seconds"] });
        if (!reserve.ok) throw new SessionError("PAYWALL", "Ya usaste tu clase gratis. Elige un plan para seguir practicando.");
      }

      // Si hay gente esperando, nadie se salta la fila.
      if (!input.queueEntryId) {
        const waiting = await tx.sessionQueueEntry.count({
          where: {
            status: { in: ["WAITING", "OFFERED"] },
            userId: { not: input.user.id },
            lastSeenAt: { gte: new Date(now.getTime() - 30_000) },
          },
        });
        if (waiting > 0) throw new NoSlotError();
      }

      await tx.tutorSession.create({
        data: {
          id: sessionId,
          userId: input.user.id,
          language: input.language,
          audience,
          lessonId: lesson?.id ?? null,
          isTrial,
          testMode,
          status: "RESERVED",
          clientRequestId: input.clientRequestId,
          queueEntryId: input.queueEntryId,
          palId: pal.palId,
          conversationName: `mypal:${sessionId}`,
          reservedSeconds: reserve.reserveSeconds,
          maxCallDurationSec: reserve.maxCallDurationSeconds,
          costPerMinMicroUsd: config["tavus.costPerMinMicroUsd"],
        },
      });

      const slot = await claimSlot(tx, sessionId, input.queueEntryId);
      if (slot === null) throw new NoSlotError();
      await tx.tutorSession.update({ where: { id: sessionId }, data: { slotId: slot } });
      if (input.queueEntryId) {
        await tx.sessionQueueEntry.updateMany({
          where: { id: input.queueEntryId, userId: input.user.id },
          data: { status: "CLAIMED" },
        });
      }

      await placeHold(tx, { userId: input.user.id, sessionId, isTrial, seconds: reserve.reserveSeconds, now });
      return { kind: "reserved" as const, reserve: { ...reserve, isTrial } };
    });

    if (outcome.kind === "existing") return outcome;
    reserved = outcome.reserve;
  } catch (err) {
    if (err instanceof NoSlotError) {
      const entry = await enqueue(input.user.id, input.language, input.lessonId);
      return { kind: "queued", queueEntryId: entry.id, position: await queuePosition(entry.id) };
    }
    throw err;
  }

  await createConversation(sessionId, {
    user: input.user,
    language: input.language,
    audience,
    level: kids ? null : (profile?.level ?? null),
    memoryTag: profile?.memoryTag ? (kids ? `${profile.memoryTag}_kids` : profile.memoryTag) : null,
    lessonId: lesson?.id ?? null,
    isTrial: reserved.isTrial,
    maxCallSeconds: reserved.maxCallDurationSeconds,
    palId: pal.palId,
    testMode,
  });
  return { kind: "started", sessionId };
}

async function assertMonthlyBudget(tx: Tx, budgetSeconds: number) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [billed, open] = await Promise.all([
    tx.tutorSession.aggregate({
      where: { createdAt: { gte: monthStart }, testMode: false, billedSeconds: { not: null } },
      _sum: { billedSeconds: true },
    }),
    tx.tutorSession.aggregate({ where: { status: { in: OPEN } }, _sum: { reservedSeconds: true } }),
  ]);
  const used = (billed._sum.billedSeconds ?? 0) + (open._sum.reservedSeconds ?? 0);
  if (used >= budgetSeconds) {
    throw new SessionError("SERVICE_PAUSED", "Alcanzamos el cupo de clases de este mes. Estamos ampliándolo: vuelve pronto.");
  }
}

// ---------------------------------------------------------------------------
// Cupos de concurrencia y cola
// ---------------------------------------------------------------------------

async function claimSlot(tx: Tx, sessionId: string, queueEntryId: string | null): Promise<number | null> {
  const rows = await tx.$queryRaw<{ id: number }[]>`
    UPDATE "ConcurrencySlot"
    SET state = 'BUSY', "sessionId" = ${sessionId}, "queueEntryId" = NULL, "offeredUntil" = NULL, "changedAt" = now()
    WHERE id = (
      SELECT id FROM "ConcurrencySlot"
      WHERE state = 'FREE'
         OR (state = 'OFFERED' AND "queueEntryId" = ${queueEntryId}::text AND "offeredUntil" > now())
      ORDER BY ("queueEntryId" IS NOT DISTINCT FROM ${queueEntryId}::text) DESC, id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  return rows[0]?.id ?? null;
}

/** Libera el cupo de una clase: se ofrece al primero de la fila o queda libre. */
async function releaseSlot(tx: Tx, sessionId: string) {
  const config = await getConfig();
  const slots = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM "ConcurrencySlot" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
  if (!slots.length) return;
  const slotId = slots[0].id;
  if (slotId > config["concurrency.limit"]) {
    await tx.concurrencySlot.update({ where: { id: slotId }, data: { state: "DISABLED", sessionId: null } });
    return;
  }
  await offerOrFree(tx, slotId, config["queue.offerSeconds"]);
}

async function offerOrFree(tx: Tx, slotId: number, offerSeconds: number) {
  const head = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "SessionQueueEntry"
    WHERE status = 'WAITING' AND "lastSeenAt" > now() - interval '30 seconds'
    ORDER BY "createdAt" ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED`;
  if (head.length) {
    const until = new Date(Date.now() + offerSeconds * 1000);
    await tx.concurrencySlot.update({
      where: { id: slotId },
      data: { state: "OFFERED", sessionId: null, queueEntryId: head[0].id, offeredUntil: until },
    });
    await tx.sessionQueueEntry.update({ where: { id: head[0].id }, data: { status: "OFFERED", offeredAt: new Date() } });
  } else {
    await tx.concurrencySlot.update({
      where: { id: slotId },
      data: { state: "FREE", sessionId: null, queueEntryId: null, offeredUntil: null },
    });
  }
}

async function enqueue(userId: string, language: TargetLang, lessonId: string | null) {
  const existing = await db.sessionQueueEntry.findFirst({
    where: { userId, status: { in: ["WAITING", "OFFERED"] } },
  });
  if (existing) {
    return db.sessionQueueEntry.update({ where: { id: existing.id }, data: { lastSeenAt: new Date(), language, lessonId } });
  }
  try {
    return await db.sessionQueueEntry.create({ data: { userId, language, lessonId } });
  } catch {
    // Carrera con el indice "una entrada activa por usuario": usar la existente.
    return db.sessionQueueEntry.findFirstOrThrow({ where: { userId, status: { in: ["WAITING", "OFFERED"] } } });
  }
}

export async function queuePosition(entryId: string): Promise<number> {
  const entry = await db.sessionQueueEntry.findUnique({ where: { id: entryId } });
  if (!entry || !["WAITING", "OFFERED"].includes(entry.status)) return 0;
  if (entry.status === "OFFERED") return 0;
  const ahead = await db.sessionQueueEntry.count({
    where: {
      status: "WAITING",
      createdAt: { lt: entry.createdAt },
      lastSeenAt: { gte: new Date(Date.now() - 30_000) },
    },
  });
  return ahead + 1;
}

/** Mantenimiento de la cola (worker): ofertas vencidas, abandonos y cupos libres. */
export async function maintainQueue() {
  const config = await getConfig();
  await withTx(async (tx) => {
    // Ofertas no reclamadas a tiempo: la entrada vence y el cupo pasa al siguiente.
    const expired = await tx.$queryRaw<{ id: number; queueEntryId: string }[]>`
      SELECT id, "queueEntryId" FROM "ConcurrencySlot"
      WHERE state = 'OFFERED' AND "offeredUntil" < now()
      FOR UPDATE SKIP LOCKED`;
    for (const s of expired) {
      await tx.sessionQueueEntry.updateMany({ where: { id: s.queueEntryId, status: "OFFERED" }, data: { status: "EXPIRED" } });
      await offerOrFree(tx, s.id, config["queue.offerSeconds"]);
    }
    await tx.sessionQueueEntry.updateMany({
      where: { status: "WAITING", lastSeenAt: { lt: new Date(Date.now() - 30_000) } },
      data: { status: "ABANDONED" },
    });
    // Cupos libres con gente esperando.
    const free = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM "ConcurrencySlot" WHERE state = 'FREE' ORDER BY id FOR UPDATE SKIP LOCKED`;
    for (const s of free) await offerOrFree(tx, s.id, config["queue.offerSeconds"]);
  });
}

/** Ajusta las filas de cupos al limite configurado. */
export async function syncSlots() {
  const config = await getConfig({ fresh: true });
  const limit = config["concurrency.limit"];
  for (let id = 1; id <= limit; id++) {
    await db.concurrencySlot.upsert({ where: { id }, create: { id, state: "FREE" }, update: {} });
  }
  await db.concurrencySlot.updateMany({ where: { id: { gt: limit }, state: "FREE" }, data: { state: "DISABLED" } });
  await db.concurrencySlot.updateMany({ where: { id: { lte: limit }, state: "DISABLED" }, data: { state: "FREE" } });
}

// ---------------------------------------------------------------------------
// Crear la conversacion en Tavus (fuera de transaccion)
// ---------------------------------------------------------------------------

async function createConversation(
  sessionId: string,
  input: {
    user: { id: string; name: string };
    language: TargetLang;
    audience: Audience;
    level: Cefr | null;
    memoryTag: string | null;
    lessonId: string | null;
    isTrial: boolean;
    maxCallSeconds: number;
    palId: string;
    testMode: boolean;
  },
) {
  const config = await getConfig();
  const moved = await db.tutorSession.updateMany({
    where: { id: sessionId, status: "RESERVED" },
    data: { status: "CREATING", createRequestedAt: new Date() },
  });
  if (!moved.count) return;

  const { context, greeting, languages } = await buildContext({
    userId: input.user.id,
    userName: input.user.name,
    language: input.language,
    audience: input.audience,
    level: input.level,
    lessonId: input.lessonId,
    isTrial: input.isTrial,
    maxCallSeconds: input.maxCallSeconds,
  });
  const webhookBase = process.env.PUBLIC_WEBHOOK_URL?.trim();

  try {
    const conv = await tavus().createConversation({
      pal_id: input.palId,
      conversation_name: `mypal:${sessionId}`,
      conversational_context: context,
      custom_greeting: greeting,
      callback_url: webhookBase ? `${webhookBase}/api/tavus/webhook/${sessionId}.${signSession(sessionId, "webhook")}` : undefined,
      participant_tags: !input.isTrial && input.memoryTag ? [input.memoryTag] : undefined,
      require_auth: true,
      max_participants: 2,
      test_mode: input.testMode || undefined,
      properties: {
        max_call_duration: input.maxCallSeconds,
        participant_absent_timeout: config["session.participantAbsentTimeout"],
        participant_left_timeout: config["session.participantLeftTimeout"],
        enable_closed_captions: true,
        enable_recording: false,
        languages,
      },
    });
    const createdAt = conv.created_at ? new Date(conv.created_at) : null;
    const start = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : new Date();
    await db.tutorSession.updateMany({
      where: { id: sessionId, status: "CREATING" },
      data: {
        status: "READY",
        tavusConversationId: conv.conversation_id,
        conversationUrl: conv.conversation_url,
        meetingToken: conv.meeting_token ?? null,
        tavusCreatedAt: createdAt,
        hardDeadlineAt: new Date(start.getTime() + input.maxCallSeconds * 1000),
      },
    });
    const after = await db.tutorSession.findUnique({ where: { id: sessionId }, select: { cancelRequested: true } });
    if (after?.cancelRequested) await requestEnd(sessionId, "USER_END");
  } catch (err) {
    if (err instanceof TavusApiError && err.definite) {
      await failSession(sessionId, `tavus_${err.status}`);
      throw new SessionError("TAVUS_ERROR", "No pudimos conectar con tu tutor. No se descontó ningún minuto. Inténtalo de nuevo.");
    }
    // Resultado incierto: la sesion queda en CREATING y el worker la resuelve
    // (busca la conversacion por nombre; si existe la cierra sin cobrarte).
    await db.tutorSession.updateMany({ where: { id: sessionId }, data: { failureCode: "create_uncertain" } });
    throw new SessionError("TAVUS_ERROR", "Tu tutor tarda en responder. No se descontó ningún minuto. Inténtalo en un momento.");
  }
}

/** Falla definitiva (nada se creo en Tavus): libera reserva y cupo, sin cobro. */
export async function failSession(sessionId: string, code: string) {
  const s = await db.tutorSession.findUnique({ where: { id: sessionId }, select: { userId: true } });
  if (!s) return;
  await withTx(async (tx) => {
    await lockWallet(tx, s.userId);
    const moved = await tx.tutorSession.updateMany({
      where: { id: sessionId, status: { in: ["RESERVED", "CREATING"] } },
      data: { status: "FAILED", failureCode: code, endReason: "CREATE_FAILED", settledAt: new Date(), chargedSeconds: 0, billedSeconds: 0 },
    });
    if (!moved.count) return;
    await settleSessionHolds(tx, { userId: s.userId, sessionId, chargeSeconds: 0, now: new Date() });
    await releaseSlot(tx, sessionId);
  });
}

// ---------------------------------------------------------------------------
// Fin de la clase
// ---------------------------------------------------------------------------

/** Pide terminar (idempotente). Cualquier via de cierre llega aqui. */
export async function requestEnd(sessionId: string, reason: EndReason) {
  const moved = await db.tutorSession.updateMany({
    where: { id: sessionId, status: { in: ["READY", "LIVE"] } },
    data: { status: "ENDING", endReason: reason, endRequestedAt: new Date() },
  });
  const s = await db.tutorSession.findUnique({ where: { id: sessionId } });
  if (!s) return;
  if (!moved.count) {
    if (s.status === "RESERVED" || s.status === "CREATING") {
      await db.tutorSession.update({ where: { id: sessionId }, data: { cancelRequested: true } });
      return;
    }
    if (s.status !== "ENDING") return;
  }
  if (s.tavusConversationId) {
    try {
      await tavus().endConversation(s.tavusConversationId);
    } catch (err) {
      console.warn(`[sessions] no se pudo terminar ${sessionId} en Tavus (el worker reintenta):`, err);
    }
  }
  await confirmEnded(sessionId).catch(() => false);
}

function extractShutdown(conv: TavusConversationDetail) {
  const ev = (conv.events ?? []).find((e) => e.event_type === "system.shutdown");
  const ts = ev?.timestamp ? new Date(ev.timestamp) : conv.updated_at ? new Date(conv.updated_at) : null;
  const props = (ev?.properties ?? {}) as Record<string, unknown>;
  const reason = (props.shutdown_reason ?? props.reason ?? null) as string | null;
  return { endedAt: ts && !Number.isNaN(ts.getTime()) ? ts : null, reason };
}

/**
 * Confirma con Tavus que la conversacion termino. Solo entonces se libera el
 * cupo y se liquida. Devuelve true si la clase quedo ENDED/SETTLED.
 */
export async function confirmEnded(sessionId: string, known?: TavusConversationDetail | null): Promise<boolean> {
  const s = await db.tutorSession.findUnique({ where: { id: sessionId } });
  if (!s) return false;
  if (s.status === "SETTLED" || s.status === "FAILED") return true;
  if (s.status === "ENDED") {
    await settleSession(sessionId);
    return true;
  }
  if (!s.tavusConversationId) return false;
  const conv = known ?? (await tavus().getConversation(s.tavusConversationId, true));
  if (!conv || conv.status !== "ended") return false;

  const { endedAt, reason } = extractShutdown(conv);
  await storeTranscript(sessionId, conv);
  await withTx(async (tx) => {
    const moved = await tx.tutorSession.updateMany({
      where: { id: sessionId, status: { in: ["READY", "LIVE", "ENDING"] } },
      data: {
        status: "ENDED",
        tavusEndedAt: endedAt,
        endObservedAt: new Date(),
        shutdownReason: reason?.slice(0, 200) ?? null,
      },
    });
    if (moved.count) {
      await tx.tutorSession.updateMany({ where: { id: sessionId, endReason: null }, data: { endReason: "TAVUS_SHUTDOWN" } });
      await releaseSlot(tx, sessionId);
    }
  });
  await settleSession(sessionId);
  return true;
}

async function storeTranscript(sessionId: string, conv: TavusConversationDetail) {
  const ev = (conv.events ?? []).find((e) => e.event_type === "application.transcription_ready");
  const turns = (ev?.properties as { transcript?: unknown[] } | undefined)?.transcript;
  const perception = (conv.events ?? []).find((e) => e.event_type === "application.perception_analysis");
  if (!turns) return;
  const analysis = (perception?.properties as { analysis?: string } | undefined)?.analysis ?? null;
  await db.transcript.upsert({
    where: { sessionId },
    create: { sessionId, turns: turns as never, perceptionAnalysis: analysis, fetchedVia: "POLL" },
    update: {},
  });
}

/** Liquida (idempotente): cobra lo usado, devuelve el resto, registra el costo. */
export async function settleSession(sessionId: string) {
  const config = await getConfig();
  const s = await db.tutorSession.findUnique({ where: { id: sessionId } });
  if (!s || s.status !== "ENDED") return;

  // Reloj unico: ambos de Tavus, o ambos nuestros.
  const tavusClock = s.tavusCreatedAt && s.tavusEndedAt;
  const start = tavusClock ? s.tavusCreatedAt! : (s.createRequestedAt ?? s.createdAt);
  const end = tavusClock ? s.tavusEndedAt! : (s.endObservedAt ?? new Date());
  const billed = billedSecondsFromDuration(end.getTime() - start.getTime(), Boolean(s.tavusConversationId));
  const waive =
    s.endReason === "CREATE_FAILED" ||
    s.endReason === "ORPHAN" ||
    (!s.joinedAt && !config["billing.chargeNoShow"]);
  const charge = waive ? 0 : billed;

  await withTx(async (tx) => {
    await lockWallet(tx, s.userId);
    const row = await tx.tutorSession.findUniqueOrThrow({ where: { id: sessionId } });
    if (row.status !== "ENDED") return;
    const result = await settleSessionHolds(tx, { userId: s.userId, sessionId, chargeSeconds: charge, now: new Date() });
    await tx.tutorSession.update({
      where: { id: sessionId },
      data: {
        status: "SETTLED",
        billedSeconds: billed,
        chargedSeconds: result.capturedSeconds + result.overrunCollectedSeconds,
        uncollectedSeconds: result.uncollectedSeconds,
        costMicroUsd: s.testMode ? BigInt(0) : costMicroUsd(billed, s.costPerMinMicroUsd),
        settledAt: new Date(),
      },
    });
    if (result.uncollectedSeconds > 0) {
      console.warn(`[sessions] ${sessionId}: ${result.uncollectedSeconds} s sin cobrar (exceso sobre la reserva)`);
    }
    // Progreso del alumno: solo si realmente converso.
    if (row.joinedAt && billed >= 60) {
      await recordPractice(tx, s.userId, s.language, s.lessonId, end);
    }
  });
}

async function recordPractice(tx: Tx, userId: string, language: TargetLang, lessonId: string | null, at: Date) {
  const profile = await tx.languageProfile.findUnique({ where: { userId_language: { userId, language } } });
  if (profile) {
    const last = profile.lastPracticeAt;
    const dayMs = 86_400_000;
    const day = (d: Date) => Math.floor(d.getTime() / dayMs);
    const streak = !last ? 1 : day(at) === day(last) ? profile.streakDays || 1 : day(at) - day(last) === 1 ? profile.streakDays + 1 : 1;
    await tx.languageProfile.update({
      where: { id: profile.id },
      data: { lastPracticeAt: at, streakDays: streak, xp: { increment: 10 } },
    });
  }
  if (lessonId) {
    await tx.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId, sessionsCount: 1, lastSessionAt: at },
      update: { sessionsCount: { increment: 1 }, lastSessionAt: at },
    });
  }
}

// ---------------------------------------------------------------------------
// Señales del navegador
// ---------------------------------------------------------------------------

export async function markJoined(sessionId: string, userId: string) {
  await db.tutorSession.updateMany({
    where: { id: sessionId, userId, status: "READY" },
    data: { status: "LIVE", joinedAt: new Date(), lastHeartbeatAt: new Date() },
  });
}

export async function heartbeat(sessionId: string, userId: string) {
  await db.tutorSession.updateMany({
    where: { id: sessionId, userId, status: { in: ["READY", "LIVE"] } },
    data: { lastHeartbeatAt: new Date() },
  });
}

/** Resuelve una creacion incierta: busca la conversacion por nombre. */
export async function resolveUncertainCreate(sessionId: string) {
  const s = await db.tutorSession.findUnique({ where: { id: sessionId } });
  if (!s || s.status !== "CREATING") return;
  const name = `mypal:${sessionId}`;
  const found = (await tavus().listConversations({ status: "active", limit: 100 })).find((c) => c.conversation_name === name);
  if (found) {
    // Existe: la adoptamos, la cerramos y no se cobra al usuario (ORPHAN).
    await db.tutorSession.update({
      where: { id: sessionId },
      data: {
        status: "ENDING",
        tavusConversationId: found.conversation_id,
        tavusCreatedAt: found.created_at ? new Date(found.created_at) : null,
        endReason: "ORPHAN",
        endRequestedAt: new Date(),
      },
    });
    await tavus().endConversation(found.conversation_id);
    await confirmEnded(sessionId);
    return;
  }
  if (Date.now() - (s.createRequestedAt ?? s.createdAt).getTime() > 2 * 60_000) {
    await failSession(sessionId, "create_not_found");
  }
}
