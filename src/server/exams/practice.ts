/**
 * Practica autocalificada (Listening y Reading): por tipo de pregunta, por parte y por
 * seccion cronometrada. El reloj vive en el servidor; la clave nunca sale al navegador
 * mientras el intento esta abierto.
 */
import { examSpec, sectionSpec } from "@/content/exams";
import { IELTS_LISTENING_TABLE, IELTS_READING_ACADEMIC_TABLE, proportionalBand, rawToBand } from "@/content/exams/scales";
import type { ExamCode, ExamSectionCode } from "@/content/exams/types";
import type { ExamMode, Prisma } from "@/generated/prisma/client";
import { can } from "@/server/access";
import type { CurrentUser } from "@/server/auth/dal";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

import type { PublicGroup, QuestionKey } from "./bank/schemas";
import { formItemSetIds } from "./forms";
import { isObjectiveCorrect } from "./scoring/objective";

export type PracticeMode = Extract<ExamMode, "DRILL" | "PART" | "SECTION">;

export interface PracticeConfig {
  section: ExamSectionCode;
  part: number | null;
  taskType: string | null;
  itemSetIds: string[];
  /** preguntas incluidas (en DRILL solo las del tipo elegido) */
  questionNumbers: Record<string, number[]>;
  /** seccion de un simulacro completo */
  mockId?: string;
}

export class PracticeError extends Error {
  constructor(
    readonly code: "NO_ACCESS" | "NO_CONTENT" | "NOT_FOUND" | "CLOSED" | "AUDIO_LIMIT",
    message: string,
  ) {
    super(message);
    this.name = "PracticeError";
  }
}

/** Segundos de gracia despues del limite (latencia de red). */
const GRACE_MS = 15_000;

/* ───────────────────────── elegir bloques ───────────────────────── */

async function pickBlock(userId: string, exam: ExamCode, section: ExamSectionCode, part: number, taskType: string | null, exclude: string[]) {
  const [candidates, seen, forms] = await Promise.all([
    db.examItemSet.findMany({
      where: { exam, section, part, status: "APPROVED", id: { notIn: exclude }, ...(taskType ? { taskTypes: { has: taskType } } : {}) },
      select: { id: true },
    }),
    db.itemExposure.findMany({ where: { userId, itemSet: { exam, section } }, select: { itemSetId: true, seenAt: true } }),
    db.examForm.findMany({ where: { exam }, select: { blocks: true } }),
  ]);
  if (!candidates.length) return null;
  const lastSeen = new Map<string, number>();
  for (const s of seen) lastSeen.set(s.itemSetId, Math.max(lastSeen.get(s.itemSetId) ?? 0, s.seenAt.getTime()));
  // Los bloques de las formas se guardan para los simulacros: se usan al final.
  const reserved = new Set(forms.flatMap((f) => formItemSetIds(f.blocks)));
  const ranked = candidates
    .map((c) => ({ id: c.id, seen: lastSeen.get(c.id) ?? -1, reserved: reserved.has(c.id), r: Math.random() }))
    .sort((a, b) => Number(a.reserved) - Number(b.reserved) || a.seen - b.seen || a.r - b.r);
  return ranked[0].id;
}

/* ───────────────────────── empezar ───────────────────────── */

export async function startPractice(
  user: Pick<CurrentUser, "id" | "role">,
  input: { exam: ExamCode; mode: PracticeMode; section: ExamSectionCode; part?: number | null; taskType?: string | null },
): Promise<{ attemptId: string }> {
  const access = await can(user, "exam.practice");
  if (!access.allowed) throw new PracticeError("NO_ACCESS", access.reason ?? "No tienes acceso a la práctica.");
  if (input.section !== "LISTENING" && input.section !== "READING") throw new PracticeError("NO_CONTENT", "Esta sección todavía no tiene práctica autocalificada.");
  const spec = sectionSpec(input.exam, input.section);

  const parts =
    input.mode === "SECTION"
      ? spec.parts.map((p) => p.part)
      : input.mode === "PART"
        ? [input.part ?? 1]
        : // DRILL: cualquier parte que tenga ese tipo de pregunta
          spec.parts.filter((p) => !input.taskType || p.taskTypes.includes(input.taskType as never)).map((p) => p.part);

  const itemSetIds: string[] = [];
  if (input.mode === "DRILL") {
    // Una parte al azar entre las que tienen el tipo y bloque disponible.
    for (const part of [...parts].sort(() => Math.random() - 0.5)) {
      const id = await pickBlock(user.id, input.exam, input.section, part, input.taskType ?? null, []);
      if (id) {
        itemSetIds.push(id);
        break;
      }
    }
  } else {
    for (const part of parts) {
      const id = await pickBlock(user.id, input.exam, input.section, part, null, itemSetIds);
      if (!id) throw new PracticeError("NO_CONTENT", `Todavía no hay material aprobado para ${spec.name} parte ${part}.`);
      itemSetIds.push(id);
    }
  }
  if (!itemSetIds.length) throw new PracticeError("NO_CONTENT", "Todavía no hay material aprobado para esa práctica.");

  let minutes: number | null = null;
  if (input.mode === "SECTION") minutes = spec.minutes + (spec.reviewMinutes ?? 0);
  else if (input.mode === "PART") minutes = spec.parts.find((p) => p.part === input.part)!.minutes + (input.section === "LISTENING" ? 2 : 0);
  return createObjectiveAttempt({
    userId: user.id,
    exam: input.exam,
    mode: input.mode,
    section: input.section,
    part: input.mode === "PART" ? (input.part ?? 1) : null,
    taskType: input.mode === "DRILL" ? (input.taskType ?? null) : null,
    itemSetIds,
    minutes,
  });
}

/** Crea el intento con los bloques ya elegidos (practica o seccion de un simulacro). */
export async function createObjectiveAttempt(input: {
  userId: string;
  exam: ExamCode;
  mode: PracticeMode;
  section: ExamSectionCode;
  part: number | null;
  taskType: string | null;
  itemSetIds: string[];
  minutes: number | null;
  mockId?: string;
}): Promise<{ attemptId: string }> {
  const { itemSetIds } = input;
  const blocks = await db.examItemSet.findMany({ where: { id: { in: itemSetIds } }, select: { id: true, content: true } });
  const questionNumbers: Record<string, number[]> = {};
  for (const b of blocks) {
    const groups = (b.content as unknown as { groups: PublicGroup[] }).groups;
    questionNumbers[b.id] = groups.filter((g) => !input.taskType || g.taskType === input.taskType).flatMap((g) => g.questions.map((q) => q.number));
  }
  const config: PracticeConfig = {
    section: input.section,
    part: input.part,
    taskType: input.taskType,
    itemSetIds,
    questionNumbers,
    ...(input.mockId ? { mockId: input.mockId } : {}),
  };
  const now = Date.now();
  const user = { id: input.userId };

  const attempt = await db.$transaction(async (tx) => {
    const a = await tx.examAttempt.create({
      data: { userId: user.id, exam: input.exam, mode: input.mode, config: config as unknown as Prisma.InputJsonValue },
    });
    await tx.examSectionAttempt.create({
      data: {
        attemptId: a.id,
        section: input.section,
        part: config.part ?? 0,
        itemSetIds,
        deadlineAt: input.minutes ? new Date(now + input.minutes * 60_000) : null,
      },
    });
    for (const id of itemSetIds)
      await tx.itemExposure.upsert({
        where: { userId_itemSetId_mode: { userId: user.id, itemSetId: id, mode: input.mockId ? "MOCK" : input.mode } },
        create: { userId: user.id, itemSetId: id, mode: input.mockId ? "MOCK" : input.mode },
        update: { seenAt: new Date() },
      });
    return a;
  });
  return { attemptId: attempt.id };
}

/* ───────────────────────── cargar ───────────────────────── */

export interface PracticeView {
  id: string;
  exam: ExamCode;
  examName: string;
  mode: PracticeMode;
  status: string;
  /** seccion de un simulacro completo */
  mockId: string | null;
  section: ExamSectionCode;
  sectionName: string;
  part: number | null;
  taskType: string | null;
  deadlineAt: string | null;
  serverNow: string;
  /** veces que puede sonar cada audio (null = libre) */
  plays: number | null;
  listeningReadSeconds: number;
  blocks: {
    id: string;
    part: number;
    content: Record<string, unknown> & { kind: string; groups: PublicGroup[] };
    questionNumbers: number[];
    audio: { index: number; durationMs: number; questionsFrom: number; questionsTo: number }[];
  }[];
  answers: Record<string, Record<string, string>>;
}

export async function loadPractice(attemptId: string, userId: string): Promise<PracticeView> {
  let attempt = await db.examAttempt.findFirst({ where: { id: attemptId, userId }, include: { sections: true, responses: true } });
  if (!attempt) throw new PracticeError("NOT_FOUND", "No encontramos esa práctica.");
  const sec = attempt.sections[0];
  // Vencido: se califica lo respondido.
  if (attempt.status === "IN_PROGRESS" && sec?.deadlineAt && sec.deadlineAt.getTime() + GRACE_MS < Date.now()) {
    await submitPractice(attemptId, userId);
    attempt = (await db.examAttempt.findFirst({ where: { id: attemptId, userId }, include: { sections: true, responses: true } }))!;
  }
  const config = attempt.config as unknown as PracticeConfig;
  const items = await db.examItemSet.findMany({
    where: { id: { in: config.itemSetIds } },
    select: { id: true, part: true, content: true, audio: { select: { storageKey: true, durationMs: true }, orderBy: { storageKey: "asc" } } },
  });
  const cfg = await getConfig();
  const spec = sectionSpec(attempt.exam, config.section);
  const answers: Record<string, Record<string, string>> = {};
  for (const r of attempt.responses) (answers[r.itemSetId] ??= {})[r.questionId] = String((r.answer as { value?: string })?.value ?? "");

  return {
    id: attempt.id,
    exam: attempt.exam,
    examName: examSpec(attempt.exam).name,
    mode: attempt.mode as PracticeMode,
    status: attempt.status,
    mockId: config.mockId ?? null,
    section: config.section,
    sectionName: spec.name,
    part: config.part,
    taskType: config.taskType,
    deadlineAt: sec?.deadlineAt?.toISOString() ?? null,
    serverNow: new Date().toISOString(),
    plays: attempt.mode === "DRILL" ? null : (spec.parts[0]?.plays ?? 1),
    listeningReadSeconds: cfg["exam.listening.readSeconds"],
    blocks: config.itemSetIds
      .map((id) => items.find((i) => i.id === id)!)
      .filter(Boolean)
      .map((i) => {
        const content = i.content as PracticeView["blocks"][number]["content"];
        const segments = (content.segments as { questionsFrom: number; questionsTo: number }[] | undefined) ?? [];
        return {
          id: i.id,
          part: i.part,
          content,
          questionNumbers: config.questionNumbers[i.id] ?? [],
          audio: i.audio.map((a, index) => ({ index, durationMs: a.durationMs, ...segments[index] })),
        };
      }),
    answers,
  };
}

/* ───────────────────────── audio ───────────────────────── */

/** URL firmada de un tramo de audio. En parte y seccion cuenta las reproducciones. */
export async function audioUrl(attemptId: string, userId: string, itemSetId: string, index: number): Promise<string> {
  const attempt = await db.examAttempt.findFirst({ where: { id: attemptId, userId }, include: { sections: true } });
  if (!attempt) throw new PracticeError("NOT_FOUND", "No encontramos esa práctica.");
  const sec = attempt.sections[0];
  const config = attempt.config as unknown as PracticeConfig;
  if (!config.itemSetIds.includes(itemSetId)) throw new PracticeError("NOT_FOUND", "Ese audio no es de esta práctica.");
  const asset = await db.audioAsset.findFirst({ where: { itemSetId }, orderBy: { storageKey: "asc" }, skip: index });
  if (!asset) throw new PracticeError("NOT_FOUND", "Audio no disponible.");

  const done = attempt.status !== "IN_PROGRESS";
  if (!done && attempt.mode !== "DRILL") {
    const allowed = sectionSpec(attempt.exam, config.section).parts[0]?.plays ?? 1;
    const key = `${itemSetId}:${index}`;
    // Conteo atomico: solo suma si no se paso del limite.
    const updated = await db.$executeRaw`
      UPDATE "ExamSectionAttempt"
      SET "audioPlays" = jsonb_set("audioPlays", ARRAY[${key}::text], to_jsonb(COALESCE(("audioPlays"->>${key})::int, 0) + 1))
      WHERE id = ${sec.id} AND COALESCE(("audioPlays"->>${key})::int, 0) < ${allowed}`;
    if (!updated) throw new PracticeError("AUDIO_LIMIT", "Este audio ya sonó las veces permitidas, como en el examen.");
  }
  return storage().signedUrl(asset.storageKey, (await getConfig())["exam.audioUrlSeconds"]);
}

/* ───────────────────────── responder ───────────────────────── */

export async function saveAnswer(attemptId: string, userId: string, itemSetId: string, questionId: string, value: string, timeMs?: number) {
  const attempt = await db.examAttempt.findFirst({ where: { id: attemptId, userId }, include: { sections: true } });
  if (!attempt) throw new PracticeError("NOT_FOUND", "No encontramos esa práctica.");
  const deadline = attempt.sections[0]?.deadlineAt;
  if (attempt.status !== "IN_PROGRESS" || (deadline && deadline.getTime() + GRACE_MS < Date.now()))
    throw new PracticeError("CLOSED", "El tiempo terminó: esta respuesta ya no cuenta.");
  const config = attempt.config as unknown as PracticeConfig;
  if (!config.questionNumbers[itemSetId]?.includes(Number(questionId))) throw new PracticeError("NOT_FOUND", "Esa pregunta no es de esta práctica.");
  const answer = { value: value.slice(0, 200) };
  await db.examResponse.upsert({
    where: { attemptId_itemSetId_questionId: { attemptId, itemSetId, questionId } },
    create: { attemptId, itemSetId, questionId, answer, timeMs: timeMs ?? null },
    update: { answer, timeMs: timeMs ?? undefined, answeredAt: new Date() },
  });
}

export async function recordTabSwitch(attemptId: string, userId: string) {
  await db.examSectionAttempt.updateMany({
    where: { attempt: { id: attemptId, userId, status: "IN_PROGRESS" } },
    data: { tabSwitches: { increment: 1 } },
  });
}

/* ───────────────────────── calificar ───────────────────────── */

export interface PracticeScores {
  correct: number;
  total: number;
  band: number | null;
  /** banda estimada con pocas preguntas (proporcional) */
  bandIsEstimate: boolean;
  byTaskType: Record<string, { correct: number; total: number }>;
}

export async function submitPractice(attemptId: string, userId: string): Promise<PracticeScores> {
  const attempt = await db.examAttempt.findFirst({ where: { id: attemptId, userId }, include: { sections: true, responses: true } });
  if (!attempt) throw new PracticeError("NOT_FOUND", "No encontramos esa práctica.");
  if (attempt.status !== "IN_PROGRESS") return attempt.scores as unknown as PracticeScores;

  const config = attempt.config as unknown as PracticeConfig;
  const items = await db.examItemSet.findMany({ where: { id: { in: config.itemSetIds } }, select: { id: true, answerKey: true } });
  const byTaskType: PracticeScores["byTaskType"] = {};
  const perItem = new Map<string, { correct: number; total: number }>();
  const grades: { itemSetId: string; questionId: string; isCorrect: boolean }[] = [];
  let correct = 0;
  let total = 0;

  for (const item of items) {
    const keys = (item.answerKey as unknown as { questions: Record<string, QuestionKey> }).questions;
    const stat = { correct: 0, total: 0 };
    for (const n of config.questionNumbers[item.id] ?? []) {
      const k = keys[String(n)];
      if (!k) continue;
      const given = attempt.responses.find((r) => r.itemSetId === item.id && r.questionId === String(n));
      const value = String((given?.answer as { value?: string } | undefined)?.value ?? "");
      const ok = isObjectiveCorrect(value, k.answers, k.wordLimit);
      grades.push({ itemSetId: item.id, questionId: String(n), isCorrect: ok });
      const t = (byTaskType[k.taskType] ??= { correct: 0, total: 0 });
      t.total++;
      stat.total++;
      total++;
      if (ok) {
        t.correct++;
        stat.correct++;
        correct++;
      }
    }
    perItem.set(item.id, stat);
  }

  const table = config.section === "LISTENING" ? IELTS_LISTENING_TABLE : IELTS_READING_ACADEMIC_TABLE;
  const full = attempt.mode === "SECTION" && total === 40;
  // Con menos de 10 preguntas una banda no dice nada: solo se muestran los aciertos.
  const band = attempt.exam === "IELTS_ACADEMIC" && total >= 10 ?(full ? rawToBand(correct, table) : proportionalBand(correct, total, table)) : null;
  const scores: PracticeScores = { correct, total, band, bandIsEstimate: !full, byTaskType };

  await db.$transaction(async (tx) => {
    // Compare-and-set: si otro envio gano la carrera, no se califica dos veces.
    const closed = await tx.examAttempt.updateMany({
      where: { id: attemptId, status: "IN_PROGRESS" },
      data: { status: "COMPLETED", completedAt: new Date(), scores: scores as unknown as Prisma.InputJsonValue, overall: band },
    });
    if (!closed.count) return;
    for (const g of grades) {
      await tx.examResponse.upsert({
        where: { attemptId_itemSetId_questionId: { attemptId, itemSetId: g.itemSetId, questionId: g.questionId } },
        create: { attemptId, itemSetId: g.itemSetId, questionId: g.questionId, answer: { value: "" }, isCorrect: g.isCorrect },
        update: { isCorrect: g.isCorrect },
      });
    }
    await tx.examSectionAttempt.updateMany({ where: { attemptId }, data: { submittedAt: new Date(), correct, total, score: band } });
    for (const [id, s] of perItem)
      await tx.examItemSet.update({ where: { id }, data: { timesServed: { increment: s.total }, timesCorrect: { increment: s.correct } } });
    // Dominio por tipo de pregunta y por seccion (proporcion acumulada).
    const updates = [...Object.entries(byTaskType).map(([k, v]) => [`task:${k}`, v] as const), [`section:${config.section}`, { correct, total }] as const];
    for (const [key, v] of updates) {
      if (!v.total) continue;
      const prev = await tx.skillMastery.findUnique({ where: { userId_exam_key: { userId, exam: attempt.exam, key } } });
      const n = (prev?.n ?? 0) + v.total;
      const value = ((prev?.value ?? 0) * (prev?.n ?? 0) + v.correct) / n;
      const se = Math.sqrt(Math.max(value * (1 - value), 0.01) / n);
      await tx.skillMastery.upsert({
        where: { userId_exam_key: { userId, exam: attempt.exam, key } },
        create: { userId, exam: attempt.exam, key, value, se, n },
        update: { value, se, n },
      });
    }
  });
  return scores;
}

/** El worker cierra los intentos con el tiempo vencido. */
export async function closeExpiredPractice(): Promise<number> {
  const expired = await db.examAttempt.findMany({
    where: {
      status: "IN_PROGRESS",
      mode: { in: ["DRILL", "PART", "SECTION"] },
      sections: { some: { deadlineAt: { lt: new Date(Date.now() - GRACE_MS) } } },
    },
    select: { id: true, userId: true },
    take: 50,
  });
  for (const a of expired) await submitPractice(a.id, a.userId);
  return expired.length;
}

/* ───────────────────────── resultado ───────────────────────── */

export async function loadPracticeResult(attemptId: string, userId: string) {
  const attempt = await db.examAttempt.findFirst({ where: { id: attemptId, userId }, include: { responses: true, sections: true } });
  if (!attempt) throw new PracticeError("NOT_FOUND", "No encontramos esa práctica.");
  if (attempt.status === "IN_PROGRESS") return null;
  const config = attempt.config as unknown as PracticeConfig;
  const items = await db.examItemSet.findMany({ where: { id: { in: config.itemSetIds } }, select: { id: true, part: true, content: true, answerKey: true, topic: true } });
  return {
    attempt,
    config,
    scores: attempt.scores as unknown as PracticeScores,
    blocks: config.itemSetIds
      .map((id) => items.find((i) => i.id === id)!)
      .filter(Boolean)
      .map((i) => ({
        id: i.id,
        part: i.part,
        topic: i.topic,
        content: i.content as unknown as { kind: string; groups: PublicGroup[]; passage?: { title: string; paragraphs: { label: string; text: string }[] } },
        key: i.answerKey as unknown as {
          questions: Record<string, QuestionKey>;
          segments?: { lines: { speaker: string; text: string }[] }[];
          speakers?: { id: string; name: string }[];
        },
        questionNumbers: config.questionNumbers[i.id] ?? [],
        responses: Object.fromEntries(
          attempt.responses
            .filter((r) => r.itemSetId === i.id)
            .map((r) => [r.questionId, { value: String((r.answer as { value?: string }).value ?? ""), isCorrect: r.isCorrect }]),
        ),
      })),
  };
}

/** Resumen para el panel de examenes: dominio por tipo e intentos recientes. */
export async function practiceOverview(userId: string, exam: ExamCode) {
  const [mastery, recent, counts] = await Promise.all([
    db.skillMastery.findMany({ where: { userId, exam } }),
    db.examAttempt.findMany({
      where: { userId, exam, mode: { in: ["DRILL", "PART", "SECTION"] } },
      orderBy: { startedAt: "desc" },
      take: 16,
      select: { id: true, mode: true, status: true, config: true, scores: true, overall: true, startedAt: true },
    }),
    db.examItemSet.groupBy({ by: ["section", "part"], where: { exam, status: "APPROVED" }, _count: true }),
  ]);
  // Las secciones de un simulacro se ven en su informe, no como practicas sueltas.
  return { mastery, recent: recent.filter((a) => !(a.config as { mockId?: string }).mockId), available: counts };
}
