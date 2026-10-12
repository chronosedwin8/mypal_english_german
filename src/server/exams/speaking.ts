/**
 * Speaking IELTS con examinador por voz. Por turnos: la pregunta suena con la voz del
 * examinador (ElevenLabs, guardada en S3 y reutilizada), la persona responde grabando,
 * Scribe transcribe con marcas de tiempo y el guion decide la siguiente pregunta (en la
 * Parte 3 la IA puede repreguntar). Cada parte se califica en el worker: la IA lee la
 * transcripcion con medidas de fluidez y ESCUCHA la respuesta mas larga (pronunciacion).
 * Cada parte usa un cupo SPEAKING: se reserva al empezar y se devuelve si falla algo nuestro.
 */
import { createHash } from "node:crypto";

import { z } from "zod";

import { partSpec } from "@/content/exams";
import type { ExamCode } from "@/content/exams/types";
import type { Prisma } from "@/generated/prisma/client";
import { can } from "@/server/access";
import { ai } from "@/server/ai";
import { recordAiUsage, sttCostMicroUsd, ttsCostMicroUsd } from "@/server/ai/usage";
import type { CurrentUser } from "@/server/auth/dal";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { enqueue } from "@/server/jobs/queue";
import { speechToText, textToSpeech } from "@/server/speech/elevenlabs";
import { silenceMp3 } from "@/server/speech/mp3";
import { examVoices, examinerVoice } from "@/server/speech/voices";
import { storage, storageKeys } from "@/server/storage";

import { consumeQuota, quotaSummary, releaseQuota, reserveQuota } from "./entitlements";
import { formItemSetIds } from "./forms";
import {
  CLOSING,
  fluencyMetrics,
  nextScriptedTurn,
  part3Prepared,
  type CandidateTurn,
  type ExaminerTurn,
  type Part1Content,
  type Part2Content,
  type SpeakingTurn,
} from "./speaking-script";

export class SpeakingError extends Error {
  constructor(
    readonly code: "NO_ACCESS" | "NO_CONTENT" | "NOT_FOUND" | "CLOSED" | "BAD_AUDIO",
    message: string,
  ) {
    super(message);
    this.name = "SpeakingError";
  }
}

export type SpeakingPart = 1 | 2 | 3;
export interface SpeakingConfig {
  section: "SPEAKING";
  parts: SpeakingPart[];
  itemSetIds: string[];
  blocks: { p1?: string; p2?: string };
}

type Turn = SpeakingTurn & { source?: "prepared" | "followup" };

export const SPEAKING_CRITERIA = ["FC", "LR", "GRA", "P"] as const;
export type SpeakingCriterion = (typeof SPEAKING_CRITERIA)[number];

/* ───────────────────────── empezar ───────────────────────── */

async function pickBlock(userId: string, exam: ExamCode, part: 1 | 2) {
  const [candidates, seen, forms] = await Promise.all([
    db.examItemSet.findMany({ where: { exam, section: "SPEAKING", part, status: "APPROVED" }, select: { id: true } }),
    db.itemExposure.findMany({ where: { userId, itemSet: { exam, section: "SPEAKING", part } }, select: { itemSetId: true } }),
    db.examForm.findMany({ where: { exam }, select: { blocks: true } }),
  ]);
  const seenIds = new Set(seen.map((s) => s.itemSetId));
  const reserved = new Set(forms.flatMap((f) => formItemSetIds(f.blocks)));
  return candidates
    .map((c) => ({ id: c.id, rank: (seenIds.has(c.id) ? 2 : 0) + (reserved.has(c.id) ? 1 : 0), r: Math.random() }))
    .sort((a, b) => a.rank - b.rank || a.r - b.r)[0]?.id;
}

export async function startSpeaking(user: Pick<CurrentUser, "id" | "role">, input: { exam: ExamCode; parts: SpeakingPart[] }) {
  const access = await can(user, "exam.speaking");
  if (!access.allowed) throw new SpeakingError("NO_ACCESS", access.reason ?? "No tienes partes de Speaking disponibles.");
  const parts = [...new Set(input.parts)].sort() as SpeakingPart[];
  if (!access.unlimited) {
    const q = await quotaSummary(user.id);
    if (q.SPEAKING.available < parts.length)
      throw new SpeakingError("NO_ACCESS", `Esta práctica usa ${parts.length} partes de Speaking y te quedan ${q.SPEAKING.available}.`);
  }
  const blocks: SpeakingConfig["blocks"] = {};
  if (parts.includes(1)) blocks.p1 = await pickBlock(user.id, input.exam, 1);
  if (parts.includes(2) || parts.includes(3)) blocks.p2 = await pickBlock(user.id, input.exam, 2);
  if ((parts.includes(1) && !blocks.p1) || ((parts.includes(2) || parts.includes(3)) && !blocks.p2))
    throw new SpeakingError("NO_CONTENT", "Todavía no hay preguntas de Speaking aprobadas.");
  const itemSetIds = [blocks.p1, blocks.p2].filter(Boolean) as string[];
  const config: SpeakingConfig = { section: "SPEAKING", parts, itemSetIds, blocks };

  const { attemptId, submissions } = await db.$transaction(async (tx) => {
    const a = await tx.examAttempt.create({
      data: { userId: user.id, exam: input.exam, mode: "SPEAKING", config: config as unknown as Prisma.InputJsonValue },
    });
    const subs = [];
    for (const part of parts)
      subs.push(await tx.speakingSubmission.create({ data: { attemptId: a.id, part, itemSetId: part === 1 ? blocks.p1 : blocks.p2 } }));
    for (const id of itemSetIds)
      await tx.itemExposure.upsert({
        where: { userId_itemSetId_mode: { userId: user.id, itemSetId: id, mode: "SPEAKING" } },
        create: { userId: user.id, itemSetId: id, mode: "SPEAKING" },
        update: { seenAt: new Date() },
      });
    return { attemptId: a.id, submissions: subs };
  });
  try {
    for (const s of submissions) await reserveQuota({ userId: user.id, kind: "SPEAKING", refId: s.id, unlimited: access.unlimited });
  } catch (err) {
    for (const s of submissions) await releaseQuota({ userId: user.id, kind: "SPEAKING", refId: s.id });
    await db.examAttempt.update({ where: { id: attemptId }, data: { status: "VOIDED" } });
    throw err;
  }
  await advance(attemptId);
  return { attemptId };
}

/* ───────────────────────── voz del examinador ───────────────────────── */

function examinerName(language: "en" | "de"): string {
  try {
    const id = examinerVoice(language);
    return examVoices(language).find((v) => v.id === id)?.name.split("-")[0] ?? "Alex";
  } catch {
    return "Alex";
  }
}

/** Audio del examinador para un texto (se sintetiza una vez y se reutiliza desde S3). */
export async function examinerAudio(exam: ExamCode, language: "en" | "de", text: string, refId: string): Promise<string> {
  const voice = examinerVoice(language);
  const model = process.env.ELEVENLABS_EXAMINER_MODEL?.trim() || undefined;
  const hash = createHash("sha256").update(`${voice}|${model ?? ""}|${text}`).digest("hex").slice(0, 32);
  const key = storageKeys.examinerAudio(exam, hash);
  if (await storage().exists(key)) return key;
  const audio =
    process.env.ELEVENLABS_DRIVER === "fake"
      ? silenceMp3(800)
      : await textToSpeech({ text, voiceId: voice, modelId: model, settings: { stability: 0.6, similarity_boost: 0.75, style: 0, use_speaker_boost: true } });
  await storage().put(key, audio, "audio/mpeg");
  if (process.env.ELEVENLABS_DRIVER !== "fake")
    await recordAiUsage({ provider: "elevenlabs", model: "tts", purpose: "speaking.examiner.voice", characters: text.length, costMicroUsd: await ttsCostMicroUsd(text.length), refId });
  return key;
}

/* ───────────────────────── avanzar el guion ───────────────────────── */

const FollowUpSchema = z.object({ followUp: z.string().nullable() });

async function nextPart3(sub: { id: string; turns: Turn[] }, p2: Part2Content, limit: number, userId: string): Promise<ExaminerTurn & { source?: "prepared" | "followup" } | null> {
  const prepared = part3Prepared(p2);
  const examinerTurns = sub.turns.filter((t): t is ExaminerTurn & { source?: "prepared" | "followup" } => t.kind === "examiner");
  const answered = sub.turns.filter((t) => t.kind === "candidate").length;
  if (answered >= limit) return null;
  const usedPrepared = examinerTurns.filter((t) => t.source === "prepared").length;
  const last = examinerTurns[examinerTurns.length - 1];
  const lastAnswer = [...sub.turns].reverse().find((t): t is CandidateTurn => t.kind === "candidate");
  // Como un examinador: a veces repregunta sobre lo que dijo la persona (nunca dos veces seguidas).
  if (answered > 0 && last?.source === "prepared" && lastAnswer && lastAnswer.transcript.split(/\s+/).length >= 8) {
    try {
      const r = await ai().generateJson({
        purpose: "speaking.examiner",
        modelKey: "ai.model.examiner",
        system:
          "You are an IELTS Speaking examiner in Part 3. Stay neutral: never give feedback, praise or corrections. Decide whether to ask ONE short follow-up question that makes the candidate extend, justify or speculate about what they just said. Return followUp = null if the answer was already well developed or off-topic.",
        prompt: `Examiner question: ${last.text}\nCandidate answer: ${lastAnswer.transcript}\nReturn JSON {"followUp": string | null}. A follow-up has at most 18 words and ends with "?".`,
        schema: FollowUpSchema,
        temperature: 0.4,
        userId,
        refId: sub.id,
      });
      const q = r.data.followUp?.trim();
      if (q && q.endsWith("?") && q.split(/\s+/).length <= 25) return { kind: "examiner", text: q, expects: "answer", source: "followup" };
    } catch {
      // Sin repregunta si la IA no responde a tiempo: se sigue con el guion.
    }
  }
  if (usedPrepared >= prepared.length) return null;
  return { kind: "examiner", text: prepared[usedPrepared], expects: "answer", source: "prepared" };
}

/**
 * Deja la sesion lista para la siguiente respuesta: agrega la linea del examinador o,
 * si la parte termino, la cierra, encola su calificacion y pasa a la siguiente.
 */
async function advance(attemptId: string) {
  const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { speaking: { orderBy: { part: "asc" } } } });
  if (attempt.status !== "IN_PROGRESS") return;
  const config = attempt.config as unknown as SpeakingConfig;
  const cfg = await getConfig();
  const limits = { part1Questions: cfg["exam.speaking.part1Questions"], part3Questions: cfg["exam.speaking.part3Questions"] };
  const language = "en" as const;
  const name = examinerName(language);
  const contents = await db.examItemSet.findMany({ where: { id: { in: config.itemSetIds } }, select: { id: true, content: true } });
  const p1 = contents.find((c) => c.id === config.blocks.p1)?.content as unknown as Part1Content | undefined;
  const p2 = contents.find((c) => c.id === config.blocks.p2)?.content as unknown as Part2Content | undefined;

  for (const sub of attempt.speaking) {
    if (sub.status !== "IN_PROGRESS") continue;
    const turns = sub.turns as unknown as Turn[];
    const last = turns[turns.length - 1];
    if (last?.kind === "examiner" && last.expects !== "end") return; // esperando respuesta

    let next: (ExaminerTurn & { source?: "prepared" | "followup" }) | null;
    if (sub.part === 3) next = await nextPart3({ id: sub.id, turns }, p2!, limits.part3Questions, attempt.userId);
    else next = nextScriptedTurn(sub.part as 1 | 2, turns, { p1, p2, examinerName: name, limits });

    const isLastPart = sub.part === Math.max(...config.parts);
    if (!next) {
      // Fin de la parte (en la ultima, despedida del examinador).
      const closing: Turn[] = isLastPart ? [{ kind: "examiner", text: CLOSING, expects: "end", audioKey: await examinerAudio(attempt.exam, language, CLOSING, sub.id) }] : [];
      await db.speakingSubmission.update({
        where: { id: sub.id },
        data: {
          status: "PENDING",
          turns: [...turns, ...closing] as unknown as Prisma.InputJsonValue,
          transcript: transcriptOf([...turns, ...closing]),
          metrics: fluencyMetrics(turns) as unknown as Prisma.InputJsonValue,
        },
      });
      await enqueue("speaking.grade", { submissionId: sub.id }, { dedupeKey: `speaking:${sub.id}` });
      continue;
    }
    next.audioKey = await examinerAudio(attempt.exam, language, next.text, sub.id);
    await db.speakingSubmission.update({ where: { id: sub.id }, data: { turns: [...turns, next] as unknown as Prisma.InputJsonValue } });
    return;
  }
  // Todas las partes respondidas: queda calificandose.
  await db.examAttempt.update({ where: { id: attemptId }, data: { status: "SCORING" } });
}

function transcriptOf(turns: Turn[]): string {
  return turns.map((t) => (t.kind === "examiner" ? `Examiner: ${t.text}` : `Candidate: ${t.transcript || "(no answer)"}`)).join("\n");
}

/* ───────────────────────── responder ───────────────────────── */

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export async function answerSpeaking(input: { attemptId: string; userId: string; audio: Blob; durationMs: number }) {
  const attempt = await db.examAttempt.findFirst({ where: { id: input.attemptId, userId: input.userId, mode: "SPEAKING" }, include: { speaking: { orderBy: { part: "asc" } } } });
  if (!attempt) throw new SpeakingError("NOT_FOUND", "No encontramos esa sesión de Speaking.");
  if (attempt.status !== "IN_PROGRESS") throw new SpeakingError("CLOSED", "Esta sesión ya terminó.");
  if (input.audio.size > MAX_AUDIO_BYTES) throw new SpeakingError("BAD_AUDIO", "La grabación es demasiado larga.");
  const sub = attempt.speaking.find((s) => s.status === "IN_PROGRESS");
  const turns = (sub?.turns ?? []) as unknown as Turn[];
  const last = turns[turns.length - 1];
  if (!sub || last?.kind !== "examiner" || last.expects === "end") throw new SpeakingError("CLOSED", "No hay una pregunta esperando respuesta.");

  const cfg = await getConfig();
  const maxSeconds = last.expects === "longturn" ? cfg["exam.speaking.longTurnSeconds"] : cfg["exam.speaking.answerSeconds"];
  const durationMs = Math.min(Math.max(0, Math.round(input.durationMs)), (maxSeconds + 5) * 1000);
  const ext = input.audio.type.includes("mp4") ? "m4a" : input.audio.type.includes("ogg") ? "ogg" : "webm";
  const n = turns.filter((t) => t.kind === "candidate").length + 1;
  const key = storageKeys.recording(input.userId, input.attemptId, `p${sub.part}-${String(n).padStart(2, "0")}.${ext}`);
  const bytes = Buffer.from(await input.audio.arrayBuffer());
  await storage().put(key, bytes, input.audio.type || "audio/webm");

  let transcript = "";
  let words: CandidateTurn["words"] = [];
  if (process.env.ELEVENLABS_DRIVER === "fake") {
    transcript = "This is a simulated answer for testing purposes only.";
  } else if (bytes.length > 2000) {
    const t = await speechToText({ audio: new Blob([new Uint8Array(bytes)], { type: input.audio.type || "audio/webm" }), filename: `answer.${ext}`, languageCode: "en", timeoutMs: 60_000 });
    transcript = t.text;
    words = t.words;
    await recordAiUsage({ provider: "elevenlabs", model: "scribe", purpose: "speaking.stt", seconds: Math.round(durationMs / 1000), costMicroUsd: await sttCostMicroUsd(durationMs / 1000), userId: input.userId, refId: sub.id });
  }
  const turn: CandidateTurn = { kind: "candidate", audioKey: key, transcript, durationMs, words };
  // Compare-and-set: solo se agrega si nadie respondio esta pregunta antes (doble clic).
  const updated = await db.speakingSubmission.updateMany({
    where: { id: sub.id, status: "IN_PROGRESS", turns: { equals: sub.turns as Prisma.InputJsonValue } },
    data: { turns: [...turns, turn] as unknown as Prisma.InputJsonValue },
  });
  if (!updated.count) throw new SpeakingError("CLOSED", "Esa pregunta ya tenía respuesta.");
  await advance(input.attemptId);
  return speakingState(input.attemptId, input.userId);
}

/* ───────────────────────── estado para la pantalla ───────────────────────── */

export async function speakingState(attemptId: string, userId: string) {
  const attempt = await db.examAttempt.findFirst({ where: { id: attemptId, userId, mode: "SPEAKING" }, include: { speaking: { orderBy: { part: "asc" } } } });
  if (!attempt) throw new SpeakingError("NOT_FOUND", "No encontramos esa sesión de Speaking.");
  const cfg = await getConfig();
  const config = attempt.config as unknown as SpeakingConfig;
  const current = attempt.speaking.find((s) => s.status === "IN_PROGRESS") ?? null;
  const turns = (current?.turns ?? []) as unknown as Turn[];
  const last = turns[turns.length - 1];
  const waiting = current && last?.kind === "examiner" ? last : null;
  const closing = attempt.speaking.flatMap((s) => (s.turns as unknown as Turn[]).filter((t): t is ExaminerTurn => t.kind === "examiner" && t.expects === "end"));
  const seconds = cfg["exam.audioUrlSeconds"];
  let card: Part2Content["card"] | null = null;
  if (current?.part === 2 && config.blocks.p2) {
    const block = await db.examItemSet.findUnique({ where: { id: config.blocks.p2 }, select: { content: true } });
    card = (block?.content as unknown as Part2Content).card;
  }
  const spec = partSpec(attempt.exam, "SPEAKING", 2);
  return {
    attemptId: attempt.id,
    exam: attempt.exam,
    status: attempt.status,
    parts: attempt.speaking.map((s) => ({ part: s.part, status: s.status, band: s.finalScore })),
    current: current
      ? {
          part: current.part,
          answered: turns.filter((t) => t.kind === "candidate").length,
          history: turns.map((t) => (t.kind === "examiner" ? { who: "examiner" as const, text: t.text } : { who: "candidate" as const, text: t.transcript })),
          waiting: waiting
            ? {
                text: waiting.text,
                expects: waiting.expects,
                audioUrl: waiting.audioKey ? await storage().signedUrl(waiting.audioKey, seconds) : null,
              }
            : null,
          card,
        }
      : null,
    closingAudioUrl: !current && closing.length && closing[closing.length - 1].audioKey ? await storage().signedUrl(closing[closing.length - 1].audioKey!, seconds) : null,
    limits: { answerSeconds: cfg["exam.speaking.answerSeconds"], longTurnSeconds: spec.speakSeconds ?? cfg["exam.speaking.longTurnSeconds"], prepSeconds: spec.prepSeconds ?? 60 },
  };
}
export type SpeakingState = Awaited<ReturnType<typeof speakingState>>;

/* ───────────────────────── calificar (worker) ───────────────────────── */

const SpeakingCriterionScore = z.object({ band: z.number().int().min(0).max(9), commentEs: z.string().min(3) });
const SpeakingGradeSchema = z.object({
  criteria: z.object({ FC: SpeakingCriterionScore, LR: SpeakingCriterionScore, GRA: SpeakingCriterionScore, P: SpeakingCriterionScore }),
  overviewEs: z.string().min(10),
  improvements: z.array(z.object({ said: z.string(), better: z.string(), explanationEs: z.string() })).max(8),
  nextStepsEs: z.array(z.string()).max(4),
});
export type SpeakingFeedback = z.infer<typeof SpeakingGradeSchema> & { metrics: ReturnType<typeof fluencyMetrics>; listenedSeconds: number };

const SPEAKING_GRADER_SYSTEM = `You are a certified IELTS Speaking examiner. Grade strictly, as in the official test, with whole bands 0–9:
FC Fluency and Coherence: length of turns, speed and smoothness, hesitation, self-correction, logical linking.
LR Lexical Resource: range, precision, idiomatic and less common vocabulary, paraphrase.
GRA Grammatical Range and Accuracy: variety of structures and how many sentences are error-free.
P Pronunciation: intelligibility, individual sounds, word and sentence stress, intonation, chunking. Judge P mainly from the attached audio.
Very short or missing answers lower FC and LR. Use the fluency measurements provided (they come from word timestamps).
Write every comment and explanation in neutral, encouraging Spanish with correct accents (á, é, í, ó, ú, ñ). "improvements" quote what the candidate said and give a better way to say it. Return ONLY JSON.`;

export function speakingBand(criteria: Record<SpeakingCriterion, { band: number }>): number {
  const avg = SPEAKING_CRITERIA.reduce((s, c) => s + criteria[c].band, 0) / SPEAKING_CRITERIA.length;
  return Math.floor(avg * 2 + 1e-9) / 2;
}

export async function gradeSpeaking(submissionId: string, opts: { finalAttempt: boolean }) {
  const sub = await db.speakingSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: { attempt: true } });
  if (sub.status === "GRADED") return { status: "GRADED", band: sub.finalScore };
  try {
    const turns = sub.turns as unknown as Turn[];
    const metrics = fluencyMetrics(turns);
    const answers = turns.filter((t): t is CandidateTurn => t.kind === "candidate");
    const longest = [...answers].sort((a, b) => b.durationMs - a.durationMs)[0];
    const audio = longest && longest.durationMs > 3000 ? await storage().get(longest.audioKey) : null;
    const mime = longest?.audioKey.endsWith(".m4a") ? "audio/mp4" : longest?.audioKey.endsWith(".ogg") ? "audio/ogg" : "audio/webm";
    const res = await ai().generateJson({
      purpose: "speaking.grade",
      modelKey: "ai.model.grade",
      system: SPEAKING_GRADER_SYSTEM,
      prompt: [
        `IELTS Speaking Part ${sub.part}.`,
        `Fluency measurements: ${JSON.stringify(metrics)}`,
        "Transcript (automatic speech recognition; fillers may be omitted):",
        sub.transcript || transcriptOf(turns),
        audio ? `\nThe attached audio is the candidate's longest answer (${Math.round(longest.durationMs / 1000)} s).` : "\nNo usable audio: estimate P conservatively from the transcript and say so in the comment.",
      ].join("\n"),
      schema: SpeakingGradeSchema,
      temperature: 0.3,
      userId: sub.attempt.userId,
      refId: submissionId,
      audio: audio ? { data: audio, mimeType: mime } : undefined,
    });
    const band = speakingBand(res.data.criteria);
    const feedback: SpeakingFeedback = { ...res.data, metrics, listenedSeconds: audio ? Math.round(longest.durationMs / 1000) : 0 };
    await db.speakingSubmission.update({
      where: { id: submissionId },
      data: {
        status: "GRADED",
        finalScore: band,
        grades: [res.data.criteria] as unknown as Prisma.InputJsonValue,
        feedback: feedback as unknown as Prisma.InputJsonValue,
        costMicroUsd: res.costMicroUsd,
        gradedAt: new Date(),
      },
    });
    await consumeQuota({ userId: sub.attempt.userId, kind: "SPEAKING", refId: submissionId });
    await finishIfGraded(sub.attemptId);
    return { status: "GRADED", band };
  } catch (err) {
    if (opts.finalAttempt) {
      await releaseQuota({ userId: sub.attempt.userId, kind: "SPEAKING", refId: submissionId });
      await db.speakingSubmission.update({ where: { id: submissionId }, data: { status: "FAILED" } });
      await finishIfGraded(sub.attemptId);
    }
    throw err;
  }
}

/** Cuando todas las partes tienen nota (o fallaron), cierra el intento con la banda total. */
async function finishIfGraded(attemptId: string) {
  const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { speaking: true } });
  if (attempt.speaking.some((s) => s.status === "IN_PROGRESS" || s.status === "PENDING")) return;
  const graded = attempt.speaking.filter((s) => s.status === "GRADED");
  if (!graded.length) {
    await db.examAttempt.update({ where: { id: attemptId }, data: { status: "VOIDED" } });
    return;
  }
  const criteria = Object.fromEntries(
    SPEAKING_CRITERIA.map((c) => [c, graded.reduce((s, g) => s + (g.feedback as unknown as SpeakingFeedback).criteria[c].band, 0) / graded.length]),
  ) as Record<SpeakingCriterion, number>;
  const band = speakingBand(Object.fromEntries(SPEAKING_CRITERIA.map((c) => [c, { band: criteria[c] }])) as Record<SpeakingCriterion, { band: number }>);
  await db.examAttempt.update({
    where: { id: attemptId },
    data: { status: "COMPLETED", completedAt: new Date(), overall: band, scores: { band, criteria } as Prisma.InputJsonValue },
  });
  for (const c of SPEAKING_CRITERIA) {
    const key = `speaking:${c}`;
    const prev = await db.skillMastery.findUnique({ where: { userId_exam_key: { userId: attempt.userId, exam: attempt.exam, key } } });
    const n = (prev?.n ?? 0) + 1;
    const value = prev ? prev.value * 0.6 + criteria[c] * 0.4 : criteria[c];
    await db.skillMastery.upsert({
      where: { userId_exam_key: { userId: attempt.userId, exam: attempt.exam, key } },
      create: { userId: attempt.userId, exam: attempt.exam, key, value, se: 1, n },
      update: { value, se: Math.max(0.5, 1 / Math.sqrt(n)), n },
    });
  }
}

/** Resultado para la pantalla (solo del dueno). */
export async function loadSpeakingResult(attemptId: string, userId: string) {
  const attempt = await db.examAttempt.findFirst({ where: { id: attemptId, userId, mode: "SPEAKING" }, include: { speaking: { orderBy: { part: "asc" } } } });
  if (!attempt) throw new SpeakingError("NOT_FOUND", "No encontramos esa sesión de Speaking.");
  const seconds = (await getConfig())["exam.audioUrlSeconds"];
  return {
    attempt,
    parts: await Promise.all(
      attempt.speaking.map(async (s) => {
        const turns = s.turns as unknown as Turn[];
        return {
          part: s.part,
          status: s.status,
          band: s.finalScore,
          feedback: s.feedback as unknown as SpeakingFeedback | null,
          turns: await Promise.all(
            turns.map(async (t) =>
              t.kind === "examiner"
                ? { who: "examiner" as const, text: t.text, url: null }
                : { who: "candidate" as const, text: t.transcript, url: await storage().signedUrl(t.audioKey, seconds) },
            ),
          ),
        };
      }),
    ),
  };
}
