/**
 * Test de nivel gratis: sin avatar, sin registro, costo ~$0 por persona.
 * Flujo: ITEMS (adaptativo) -> SPEAKING (2 tareas, opcional) -> DONE.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { speakingTaskById, speakingTasksFor, type SpeakingTask } from "@/content/diagnostic/speaking";
import type { CefrLevel, SkillName } from "@/content/diagnostic/types";
import type { Prisma } from "@/generated/prisma/client";
import { diagnosticAudioPath, speakingAudioPath, type Variant } from "@/lib/voices";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { applyDiagnosticToProfile } from "@/server/learning/profile";
import { languageMatches, speechToText } from "@/server/speech/elevenlabs";

import {
  LEVEL_ORDER,
  TEST_RULES,
  estimateAbility,
  levelFromTheta,
  missingSkills,
  optionPermutation,
  selectNextItem,
  shouldStop,
  skillScores,
  type IrtItem,
} from "./irt";
import { scoreOpenAnswer, scoreReadAloud, speakingLevel } from "./speaking-score";

export class DiagnosticError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "RATE_LIMITED"
      | "WRONG_PHASE"
      | "STALE_ITEM"
      | "SPEAKING_DISABLED"
      | "BAD_AUDIO"
      | "STT_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "DiagnosticError";
  }
}

export type Owner = { userId: string | null; anonId: string | null };

export interface PublicItem {
  id: string;
  skill: SkillName;
  stem: string;
  passage: string | null;
  audioUrl: string | null;
  /** respaldo para la voz del navegador si falta el MP3 */
  audioText: string | null;
  options: string[];
}

export type DiagnosticState =
  | { phase: "ITEMS"; attemptId: string; answered: number; maxItems: number; item: PublicItem }
  | {
      phase: "SPEAKING";
      attemptId: string;
      index: number;
      total: number;
      task: { id: string; kind: SpeakingTask["kind"]; text: string; instructionEs: string; maxSeconds: number; modelAudioUrl: string | null };
    }
  | { phase: "DONE"; attemptId: string };

const baseOf = (v: Variant): "EN" | "DE" => (v === "DE" ? "DE" : "EN");
const sttLang = (v: Variant): "en" | "de" => (v === "DE" ? "de" : "en");

const fileExistsCache = new Map<string, boolean>();
function publicFileExists(url: string): boolean {
  if (!fileExistsCache.has(url)) fileExistsCache.set(url, existsSync(path.join(process.cwd(), "public", url)));
  return fileExistsCache.get(url)!;
}

// ---------------------------------------------------------------------------
// Banco de preguntas (cache por proceso)
// ---------------------------------------------------------------------------

type DbItem = Awaited<ReturnType<typeof db.diagnosticItem.findMany>>[number];
const poolCache = new Map<"EN" | "DE", { at: number; items: DbItem[] }>();

async function loadPool(lang: "EN" | "DE"): Promise<DbItem[]> {
  const cached = poolCache.get(lang);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.items;
  const items = await db.diagnosticItem.findMany({ where: { lang, isActive: true } });
  poolCache.set(lang, { at: Date.now(), items });
  return items;
}

function toIrt(item: DbItem): IrtItem {
  return { id: item.id, skill: item.skill, difficulty: item.difficulty, optionCount: (item.options as string[]).length };
}

function toPublic(attemptId: string, variant: Variant, item: DbItem): PublicItem {
  const options = item.options as string[];
  const perm = optionPermutation(attemptId, item.id, options.length);
  const audioUrl = item.audioText ? diagnosticAudioPath(variant, item.id) : null;
  return {
    id: item.id,
    skill: item.skill,
    stem: item.stem,
    passage: item.passage,
    audioUrl: audioUrl && publicFileExists(audioUrl) ? audioUrl : null,
    audioText: item.audioText,
    options: perm.map((orig) => options[orig]),
  };
}

// ---------------------------------------------------------------------------
// Utilidades de intento
// ---------------------------------------------------------------------------

function assertOwner(attempt: { userId: string | null; anonId: string | null }, owner: Owner) {
  const ok =
    (attempt.userId && owner.userId && attempt.userId === owner.userId) ||
    (attempt.anonId && owner.anonId && attempt.anonId === owner.anonId);
  if (!ok) throw new DiagnosticError("FORBIDDEN", "Este test no te pertenece.");
}

async function lockAttempt(tx: Prisma.TransactionClient, attemptId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "DiagnosticAttempt" WHERE id = ${attemptId} FOR UPDATE`;
  if (!rows.length) throw new DiagnosticError("NOT_FOUND", "No encontramos ese test.");
  return tx.diagnosticAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { responses: { include: { item: true }, orderBy: { seq: "asc" } }, speaking: true },
  });
}

function speakingPlan(variant: Variant, theta: number) {
  return speakingTasksFor(baseOf(variant), levelFromTheta(theta) as CefrLevel);
}

// ---------------------------------------------------------------------------
// API del servicio
// ---------------------------------------------------------------------------

export async function startAttempt(input: {
  language: Variant;
  owner: Owner;
  ipPrefixHash: string | null;
}): Promise<DiagnosticState> {
  const config = await getConfig();
  if (input.ipPrefixHash) {
    const since = new Date(Date.now() - 24 * 3600_000);
    const recent = await db.diagnosticAttempt.count({
      where: { ipPrefixHash: input.ipPrefixHash, startedAt: { gte: since } },
    });
    if (recent >= config["diagnostic.maxAttemptsPerIpPerDay"]) {
      throw new DiagnosticError("RATE_LIMITED", "Hiciste muchos tests hoy. Vuelve a intentarlo mañana.");
    }
  }
  const pool = await loadPool(baseOf(input.language));
  const attempt = await db.diagnosticAttempt.create({
    data: {
      language: input.language,
      userId: input.owner.userId,
      anonId: input.owner.userId ? null : input.owner.anonId,
      ipPrefixHash: input.ipPrefixHash,
    },
  });
  const first = selectNextItem(pool.map(toIrt), [], attempt.theta);
  if (!first) throw new Error("El banco de preguntas esta vacio: corre pnpm db:seed");
  await db.diagnosticAttempt.update({ where: { id: attempt.id }, data: { currentItemId: first.id } });
  const item = pool.find((i) => i.id === first.id)!;
  return { phase: "ITEMS", attemptId: attempt.id, answered: 0, maxItems: TEST_RULES.maxItems, item: toPublic(attempt.id, input.language, item) };
}

export async function getState(attemptId: string, owner: Owner): Promise<DiagnosticState> {
  const attempt = await db.diagnosticAttempt.findUnique({
    where: { id: attemptId },
    include: { responses: true, speaking: true },
  });
  if (!attempt) throw new DiagnosticError("NOT_FOUND", "No encontramos ese test.");
  assertOwner(attempt, owner);
  const variant = attempt.language as Variant;
  if (attempt.phase === "DONE" || attempt.status !== "IN_PROGRESS") return { phase: "DONE", attemptId };
  if (attempt.phase === "SPEAKING") return speakingState(attempt.id, variant, attempt.theta, attempt.speaking.map((s) => s.taskId));
  const pool = await loadPool(baseOf(variant));
  const item = pool.find((i) => i.id === attempt.currentItemId);
  if (!item) throw new DiagnosticError("STALE_ITEM", "Recarga la página para continuar.");
  return {
    phase: "ITEMS",
    attemptId,
    answered: attempt.responses.length,
    maxItems: TEST_RULES.maxItems,
    item: toPublic(attemptId, variant, item),
  };
}

async function speakingState(attemptId: string, variant: Variant, theta: number, doneTaskIds: string[]): Promise<DiagnosticState> {
  const tasks = speakingPlan(variant, theta);
  const nextIdx = tasks.findIndex((t) => !doneTaskIds.includes(t.id));
  if (nextIdx === -1) return { phase: "DONE", attemptId };
  const t = tasks[nextIdx];
  const config = await getConfig();
  const modelAudio = t.kind === "READ_ALOUD" ? speakingAudioPath(variant, t.id) : null;
  return {
    phase: "SPEAKING",
    attemptId,
    index: nextIdx + 1,
    total: tasks.length,
    task: {
      id: t.id,
      kind: t.kind,
      text: t.text,
      instructionEs: t.instructionEs,
      maxSeconds: config["diagnostic.maxSpeakingSeconds"],
      modelAudioUrl: modelAudio && publicFileExists(modelAudio) ? modelAudio : null,
    },
  };
}

export async function answerItem(input: {
  attemptId: string;
  owner: Owner;
  itemId: string;
  chosenIndex: number;
  latencyMs?: number;
}): Promise<DiagnosticState> {
  const config = await getConfig();
  const outcome = await db.$transaction(async (tx) => {
    const attempt = await lockAttempt(tx, input.attemptId);
    assertOwner(attempt, input.owner);
    if (attempt.status !== "IN_PROGRESS" || attempt.phase !== "ITEMS") {
      throw new DiagnosticError("WRONG_PHASE", "Esta parte del test ya terminó.");
    }
    if (attempt.currentItemId !== input.itemId) {
      throw new DiagnosticError("STALE_ITEM", "Esa pregunta ya fue respondida. Recarga la página.");
    }
    const variant = attempt.language as Variant;
    const pool = await loadPool(baseOf(variant));
    const item = pool.find((i) => i.id === input.itemId);
    if (!item) throw new DiagnosticError("NOT_FOUND", "Pregunta desconocida.");
    const options = item.options as string[];
    if (!Number.isInteger(input.chosenIndex) || input.chosenIndex < 0 || input.chosenIndex >= options.length) {
      throw new DiagnosticError("STALE_ITEM", "Respuesta invalida.");
    }
    const perm = optionPermutation(attempt.id, item.id, options.length);
    const isCorrect = perm[input.chosenIndex] === item.correctIndex;

    const history = attempt.responses.map((r) => ({
      id: r.itemId,
      skill: r.item.skill,
      difficulty: r.item.difficulty,
      optionCount: (r.item.options as string[]).length,
      correct: r.isCorrect,
    }));
    history.push({ ...toIrt(item), correct: isCorrect });
    const est = estimateAbility(history);

    await tx.diagnosticResponse.create({
      data: {
        attemptId: attempt.id,
        itemId: item.id,
        seq: history.length,
        chosenIndex: perm[input.chosenIndex],
        isCorrect,
        thetaAfter: est.theta,
        seAfter: est.se,
        latencyMs: input.latencyMs ? Math.min(Math.max(0, Math.round(input.latencyMs)), 600_000) : null,
      },
    });
    await tx.diagnosticItem.update({
      where: { id: item.id },
      data: { timesServed: { increment: 1 }, timesCorrect: { increment: isCorrect ? 1 : 0 } },
    });

    const missing = missingSkills(history.map((h) => h.skill)).length;
    let next = shouldStop(history.length, est.se, missing) ? null : selectNextItem(pool.map(toIrt), history, est.theta);
    if (next && history.length >= TEST_RULES.maxItems) next = null;

    if (next) {
      await tx.diagnosticAttempt.update({
        where: { id: attempt.id },
        data: { theta: est.theta, thetaSe: est.se, currentItemId: next.id },
      });
      return { kind: "next" as const, variant, pool, nextId: next.id, answered: history.length };
    }
    const speaking = config["diagnostic.speakingEnabled"];
    await tx.diagnosticAttempt.update({
      where: { id: attempt.id },
      data: {
        theta: est.theta,
        thetaSe: est.se,
        currentItemId: null,
        phase: speaking ? "SPEAKING" : "ITEMS",
      },
    });
    return { kind: speaking ? ("speaking" as const) : ("finish" as const), variant, theta: est.theta };
  });

  if (outcome.kind === "next") {
    const item = outcome.pool.find((i) => i.id === outcome.nextId)!;
    return {
      phase: "ITEMS",
      attemptId: input.attemptId,
      answered: outcome.answered,
      maxItems: TEST_RULES.maxItems,
      item: toPublic(input.attemptId, outcome.variant, item),
    };
  }
  if (outcome.kind === "speaking") return speakingState(input.attemptId, outcome.variant, outcome.theta, []);
  await finalizeAttempt(input.attemptId);
  return { phase: "DONE", attemptId: input.attemptId };
}

const MAX_AUDIO_BYTES = 1_500_000;

export async function submitSpeaking(input: {
  attemptId: string;
  owner: Owner;
  taskId: string;
  audio: Blob;
  durationMs: number;
}): Promise<DiagnosticState> {
  const config = await getConfig();
  if (!config["diagnostic.speakingEnabled"]) throw new DiagnosticError("SPEAKING_DISABLED", "La parte oral no está disponible.");
  if (input.audio.size === 0 || input.audio.size > MAX_AUDIO_BYTES) {
    throw new DiagnosticError("BAD_AUDIO", "La grabación está vacía o es demasiado larga.");
  }
  if (input.audio.type && !input.audio.type.startsWith("audio/") && !input.audio.type.startsWith("video/webm")) {
    throw new DiagnosticError("BAD_AUDIO", "Formato de audio no soportado.");
  }

  // 1) Validar y "reservar" la tarea antes de gastar en la transcripcion.
  const attempt = await db.diagnosticAttempt.findUnique({ where: { id: input.attemptId }, include: { speaking: true } });
  if (!attempt) throw new DiagnosticError("NOT_FOUND", "No encontramos ese test.");
  assertOwner(attempt, input.owner);
  if (attempt.status !== "IN_PROGRESS" || attempt.phase !== "SPEAKING") {
    throw new DiagnosticError("WRONG_PHASE", "Esta parte del test ya terminó.");
  }
  if (attempt.speakingCount >= 2) throw new DiagnosticError("WRONG_PHASE", "Ya completaste la parte oral.");
  const variant = attempt.language as Variant;
  const plan = speakingPlan(variant, attempt.theta);
  const expected = plan.find((t) => !attempt.speaking.some((s) => s.taskId === t.id));
  if (!expected || expected.id !== input.taskId) throw new DiagnosticError("STALE_ITEM", "Recarga la página para continuar.");
  const claimed = await db.diagnosticAttempt.updateMany({
    where: { id: attempt.id, speakingCount: attempt.speakingCount },
    data: { speakingCount: { increment: 1 } },
  });
  if (claimed.count === 0) throw new DiagnosticError("STALE_ITEM", "Ya estamos procesando esta grabación.");

  // 2) Transcribir (fuera de la transaccion).
  let transcription;
  try {
    transcription = await speechToText({ audio: input.audio, filename: `${input.taskId}.webm` });
  } catch {
    await db.diagnosticAttempt.update({ where: { id: attempt.id }, data: { speakingCount: { decrement: 1 } } });
    throw new DiagnosticError("STT_FAILED", "No pudimos procesar el audio. Inténtalo de nuevo o salta esta parte.");
  }

  const task = speakingTaskById(input.taskId)!;
  const matches = transcription.text.length > 0 && languageMatches(transcription.languageCode, sttLang(variant));
  const durationMs = Math.min(
    Math.max(input.durationMs, transcription.spokenSeconds * 1000),
    (config["diagnostic.maxSpeakingSeconds"] + 5) * 1000,
  );
  const scored =
    task.kind === "READ_ALOUD"
      ? { ...scoreReadAloud({ reference: task.text, transcript: transcription.text, languageMatches: matches }), wordsPerMinute: null, uniqueWords: null }
      : { ...scoreOpenAnswer({ transcript: transcription.text, durationMs, languageMatches: matches }), accuracy: null };

  await db.speakingSample.create({
    data: {
      attemptId: attempt.id,
      taskId: task.id,
      transcript: transcription.text.slice(0, 2000),
      accuracy: scored.accuracy,
      wordsPerMinute: scored.wordsPerMinute,
      uniqueWords: scored.uniqueWords,
      durationMs: Math.round(durationMs),
      score: scored.score,
    },
  });

  const done = [...attempt.speaking.map((s) => s.taskId), task.id];
  const state = await speakingState(attempt.id, variant, attempt.theta, done);
  if (state.phase === "DONE") await finalizeAttempt(attempt.id);
  return state;
}

export async function skipSpeaking(attemptId: string, owner: Owner): Promise<DiagnosticState> {
  const attempt = await db.diagnosticAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new DiagnosticError("NOT_FOUND", "No encontramos ese test.");
  assertOwner(attempt, owner);
  if (attempt.status === "IN_PROGRESS" && attempt.phase === "SPEAKING") await finalizeAttempt(attemptId);
  return { phase: "DONE", attemptId };
}

/** Calcula el resultado final. El nivel oral puede bajar el nivel global como mucho uno. */
export async function finalizeAttempt(attemptId: string) {
  const attempt = await db.diagnosticAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { responses: { include: { item: true } }, speaking: true },
  });
  if (attempt.status === "COMPLETED") return attempt;
  const irtLevel = levelFromTheta(attempt.theta);
  const scores: Record<string, number> = {
    ...skillScores(attempt.responses.map((r) => ({ skill: r.item.skill, correct: r.isCorrect }))),
  };
  let resultLevel = irtLevel;
  let speakingScore: number | null = null;
  if (attempt.speaking.length) {
    speakingScore = attempt.speaking.reduce((s, x) => s + x.score, 0) / attempt.speaking.length;
    scores.SPEAKING = speakingScore;
    const spoken = speakingLevel(speakingScore);
    const capped = Math.min(LEVEL_ORDER.indexOf(irtLevel), LEVEL_ORDER.indexOf(spoken) + 1);
    resultLevel = LEVEL_ORDER[Math.max(0, capped)];
  }
  const updated = await db.diagnosticAttempt.update({
    where: { id: attemptId },
    data: {
      status: "COMPLETED",
      phase: "DONE",
      currentItemId: null,
      resultLevel,
      skillScores: scores,
      speakingScore,
      completedAt: new Date(),
    },
  });
  if (updated.userId) await applyDiagnosticToProfile(updated.userId, updated);
  return updated;
}

export async function getResult(attemptId: string, owner: Owner) {
  const attempt = await db.diagnosticAttempt.findUnique({
    where: { id: attemptId },
    include: { responses: true, speaking: true },
  });
  if (!attempt) throw new DiagnosticError("NOT_FOUND", "No encontramos ese test.");
  assertOwner(attempt, owner);
  return attempt;
}

/** Al registrarse/ingresar: los tests hechos sin cuenta pasan a la cuenta. */
export async function linkAnonymousAttempts(userId: string, anonId: string) {
  const attempts = await db.diagnosticAttempt.findMany({ where: { anonId, userId: null } });
  if (!attempts.length) return 0;
  await db.diagnosticAttempt.updateMany({ where: { anonId, userId: null }, data: { userId } });
  for (const a of attempts.filter((x) => x.status === "COMPLETED")) {
    await applyDiagnosticToProfile(userId, { ...a, userId });
  }
  return attempts.length;
}
