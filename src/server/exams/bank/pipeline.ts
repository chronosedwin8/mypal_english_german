/**
 * Produccion de un bloque del banco:
 *   generar (Pro) → validar con codigo → resolver a ciegas (Flash) → juez (Flash)
 *   → si algo falla, una correccion y se repite → guardar → audio (Listening)
 *   → aprobado (o a revision humana segun la muestra configurada).
 * Lo que no pasa queda RECHAZADO con sus problemas (sirve para medir costo y calidad).
 *
 * NO se usa para llenar el banco: el banco lo escribe el equipo y se carga con
 * `pnpm bank import` (ver import.ts). Este pipeline queda como base de la generacion
 * al momento (`exam.adhoc`), que si es un uso de la API en tiempo real.
 */
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { examSpec } from "@/content/exams";
import { TOPIC_DOMAINS, TOPIC_DOMAINS_DE } from "@/content/exams/topics";
import type { ExamCode, ExamSectionCode } from "@/content/exams/types";
import type { Prisma } from "@/generated/prisma/client";
import { ai } from "@/server/ai";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { countWords, isObjectiveCorrect, isOptionalWordsVariant, textContains } from "@/server/exams/scoring/objective";
import { enqueue } from "@/server/jobs/queue";

import { synthesizeListening } from "./audio";
import { GERMAN_TARGET_BAND } from "../profiles";

import {
  PROMPT_VERSION,
  SOLVER_SYSTEM,
  generationPrompt,
  itemWriterSystem,
  judgePrompt,
  judgeSystem,
  repairPrompt,
  solverPrompt,
} from "./prompts";
import {
  COMPLETION_TYPES,
  SCHEMA_BY_KIND,
  allQuestions,
  splitBlock,
  type AnyBlock,
  type BankKind,
  type ListeningBlock,
  type ReadingBlock,
} from "./schemas";
import { bankKind, firstQuestionNumber, targetSpecs } from "./targets";
import { listeningText, validateBlock } from "./validators";

const SolverSchema = z.object({
  answers: z.array(
    z.object({
      number: z.number().int(),
      answer: z.string(),
      alternative: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

const JudgeSchema = z.object({
  authenticity: z.number().min(0).max(10),
  levelFit: z.number().min(0).max(10),
  clarity: z.number().min(0).max(10),
  fairness: z.number().min(0).max(10),
  overall: z.number().min(0).max(10),
  estimatedBand: z.number().min(0).max(9),
  problems: z.array(z.string()).max(12),
});
export type JudgeVerdict = z.infer<typeof JudgeSchema>;

export interface QaRound {
  issues: string[];
  solver?: { agreement: number; mismatches: number[] };
  judge?: JudgeVerdict;
}

export interface ProduceInput {
  exam: ExamCode;
  section: ExamSectionCode;
  part: number;
  targetBand?: number;
  domain?: string;
}

export interface ProduceResult {
  itemSetId: string;
  status: "APPROVED" | "REVIEW" | "REJECTED" | "DRAFT";
  topic: string;
  issues: string[];
  costMicroUsd: bigint;
}

type ObjectiveBlock = { kind: "reading"; data: ReadingBlock } | { kind: "listening"; data: ListeningBlock };

function isObjective(b: AnyBlock): b is ObjectiveBlock {
  return b.kind === "reading" || b.kind === "listening";
}

function sourceText(b: ObjectiveBlock): string {
  return b.kind === "reading" ? b.data.passage.paragraphs.map((p) => p.text).join("\n\n") : listeningText(b.data);
}

/** Banda objetivo con menos bloques en el inventario de esa parte. */
async function pickBand(exam: ExamCode, section: ExamSectionCode, part: number): Promise<number> {
  if (exam !== "IELTS_ACADEMIC") return GERMAN_TARGET_BAND[exam];
  const bands = (await getConfig())["exam.bank.targetBands"];
  const rows = await db.examItemSet.groupBy({
    by: ["difficulty"],
    where: { exam, section, part, status: { in: ["APPROVED", "REVIEW"] } },
    _count: true,
  });
  const counts = bands.map((b) => ({
    b,
    n: rows.filter((r) => Math.abs(r.difficulty - b) < 0.5).reduce((s, r) => s + r._count, 0),
  }));
  const min = Math.min(...counts.map((c) => c.n));
  const options = counts.filter((c) => c.n === min);
  return options[Math.floor(Math.random() * options.length)].b;
}

async function recentTopics(exam: ExamCode, section: ExamSectionCode, part: number): Promise<string[]> {
  const rows = await db.examItemSet.findMany({
    where: { exam, section, part },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { topic: true },
  });
  return [...new Set(rows.map((r) => r.topic))];
}

async function solve(block: ObjectiveBlock, refId: string) {
  const res = await ai().generateJson({
    purpose: "bank.solve",
    modelKey: "ai.model.solve",
    system: SOLVER_SYSTEM,
    prompt: solverPrompt(block),
    schema: SolverSchema,
    temperature: 0.2,
    refId,
  });
  const questions = allQuestions(block.data.groups);
  const source = sourceText(block);
  const issues: string[] = [];
  const mismatches: number[] = [];
  let correct = 0;
  for (const q of questions) {
    const given = res.data.answers.find((a) => a.number === q.number);
    if (!given) {
      mismatches.push(q.number);
      issues.push(`Q${q.number}: a test-taker could not answer it. Make it answerable from the ${block.kind === "reading" ? "passage" : "transcript"}.`);
      continue;
    }
    const isCompletion = COMPLETION_TYPES.includes(q.group.taskType);
    if (isObjectiveCorrect(given.answer, q.answers, q.group.wordLimit)) correct++;
    else if (isCompletion && isOptionalWordsVariant(given.answer, q.answers[0], source, q.group.wordLimit)) {
      // Como "(spectrometry)" opcional en las claves oficiales: se acepta tambien.
      q.answers.push(given.answer.trim());
      correct++;
    } else {
      mismatches.push(q.number);
      issues.push(
        `Q${q.number}: a strong test-taker answered "${given.answer}" but the key is "${q.answers[0]}". Rewrite the item or the key so that exactly one answer is defensible.`,
      );
      continue;
    }
    const alt = given.alternative?.trim();
    if (alt && !isObjectiveCorrect(alt, q.answers, q.group.wordLimit)) {
      if (isCompletion) {
        // Variante valida (esta en el texto y respeta el limite): se acepta tambien.
        if (textContains(source, alt) && (!q.group.wordLimit || countWords(alt) <= q.group.wordLimit)) q.answers.push(alt);
      } else {
        issues.push(`Q${q.number}: "${alt}" is also defensible besides "${q.answers[0]}". Make the item unambiguous.`);
      }
    }
  }
  return { agreement: questions.length ? correct / questions.length : 0, mismatches, issues, cost: res.costMicroUsd };
}

async function judge(exam: ExamCode, block: AnyBlock, targetBand: number, partTitle: string, refId: string) {
  const res = await ai().generateJson({
    purpose: "bank.judge",
    modelKey: "ai.model.judge",
    system: judgeSystem(exam),
    prompt: judgePrompt(block, targetBand, partTitle),
    schema: JudgeSchema,
    temperature: 0.2,
    refId,
  });
  return { verdict: res.data, cost: res.costMicroUsd };
}

function taskTypesOf(block: AnyBlock, partTaskTypes: string[]): string[] {
  if (isObjective(block)) return [...new Set(block.data.groups.map((g) => g.taskType))];
  const map: Partial<Record<BankKind, string>> = {
    writing1: "GRAPH_REPORT",
    writing2: "ESSAY",
    speaking1: "SPEAKING_INTERVIEW",
    speaking2: "SPEAKING_LONG_TURN",
  };
  return map[block.kind] ? [map[block.kind]!] : partTaskTypes;
}

export async function produceBlock(input: ProduceInput): Promise<ProduceResult> {
  const kind = bankKind(input.exam, input.section, input.part);
  if (!kind) throw new Error(`El banco no genera ${input.exam} ${input.section} parte ${input.part}`);
  const { section, part } = targetSpecs(input);
  const config = await getConfig();
  const id = randomUUID();

  const targetBand = input.targetBand ?? (await pickBand(input.exam, input.section, input.part));
  const spec = examSpec(input.exam);
  const domains = spec.language === "de" ? TOPIC_DOMAINS_DE[kind as keyof typeof TOPIC_DOMAINS_DE] : TOPIC_DOMAINS[kind as keyof typeof TOPIC_DOMAINS];
  const domain = input.domain ?? domains[Math.floor(Math.random() * domains.length)];
  const request = generationPrompt({
    exam: input.exam,
    examName: spec.name,
    language: spec.language,
    cefr: spec.cefr === "ALL" ? "B2–C1" : spec.cefr,
    kind,
    section,
    part,
    firstQuestion: kind === "reading" || kind === "listening" ? firstQuestionNumber(section, part.part) : 1,
    targetBand,
    domain,
    avoidTopics: await recentTopics(input.exam, input.section, input.part),
  });
  const schema = SCHEMA_BY_KIND[kind] as z.ZodType<AnyBlock["data"]>;

  const gen = await ai().generateJson({
    purpose: "bank.generate",
    modelKey: "ai.model.generate",
    system: itemWriterSystem(input.exam),
    prompt: request,
    schema,
    temperature: 0.9,
    refId: id,
  });
  let cost = gen.costMicroUsd;
  let block = { kind, data: gen.data } as AnyBlock;
  const rounds: QaRound[] = [];
  let issues: string[] = [];
  let verdict: JudgeVerdict | undefined;

  for (let round = 0; round < 2; round++) {
    const qa: QaRound = { issues: [] };
    issues = validateBlock(block, section, part);
    if (!issues.length && isObjective(block)) {
      const s = await solve(block, id);
      cost += s.cost;
      qa.solver = { agreement: s.agreement, mismatches: s.mismatches };
      if (s.agreement < config["exam.bank.solverMinAgreement"] || s.issues.length) issues.push(...s.issues);
    }
    if (!issues.length) {
      const j = await judge(input.exam, block, targetBand, part.title, id);
      cost += j.cost;
      verdict = j.verdict;
      qa.judge = j.verdict;
      if (j.verdict.overall < config["exam.bank.judgeMinScore"] || j.verdict.fairness < 6 || j.verdict.clarity < 6)
        issues.push(...(j.verdict.problems.length ? j.verdict.problems : ["The reviewer scored the block below the publishing threshold."]));
    }
    qa.issues = [...issues];
    rounds.push(qa);
    if (!issues.length || round === 1) break;

    const fixed = await ai().generateJson({
      purpose: "bank.repair",
      modelKey: "ai.model.generate",
      system: itemWriterSystem(input.exam),
      prompt: repairPrompt(block.data, issues, request),
      schema,
      temperature: 0.4,
      refId: id,
    });
    cost += fixed.costMicroUsd;
    block = { kind, data: fixed.data } as AnyBlock;
  }

  const passed = issues.length === 0;
  const { content, answerKey } = splitBlock(block);
  await db.examItemSet.create({
    data: {
      id,
      exam: input.exam,
      section: input.section,
      part: input.part,
      taskTypes: taskTypesOf(block, part.taskTypes),
      difficulty: verdict?.estimatedBand ?? targetBand,
      topic: block.data.topic.slice(0, 120),
      content: content as Prisma.InputJsonValue,
      answerKey: { ...answerKey, qa: { targetBand, domain, rounds } } as unknown as Prisma.InputJsonValue,
      status: passed ? "DRAFT" : "REJECTED",
      promptVersion: PROMPT_VERSION,
      model: gen.model,
      qualityScore: verdict?.overall ?? null,
      reviewNote: passed ? null : issues.join("\n").slice(0, 4000),
      costMicroUsd: cost,
    },
  });
  if (!passed) return { itemSetId: id, status: "REJECTED", topic: block.data.topic, issues, costMicroUsd: cost };

  if (block.kind === "listening") {
    const audio = await attachAudio(id);
    cost += audio.costMicroUsd;
    // Falla temporal de voz: el bloque queda en borrador y un trabajo reintenta el audio.
    if (audio.status === "FAILED") await enqueue("bank.audio", { itemSetId: id }, { dedupeKey: `audio:${id}`, runAfter: new Date(Date.now() + 10 * 60_000) });
    if (audio.status !== "OK")
      return { itemSetId: id, status: audio.status === "REJECTED" ? "REJECTED" : "DRAFT", topic: block.data.topic, issues: audio.issues, costMicroUsd: cost };
  }
  // Si el juez dudo de la claridad o de la clave, una persona lo revisa siempre.
  const doubtful =
    (verdict?.clarity ?? 10) < config["exam.bank.reviewBelowClarity"] ||
    (verdict?.problems ?? []).some((p) => /\b(answer key|key includes|ambiguous|two answers|also correct|map|inconsisten\w*|contradict\w*|incorrect|factual)\b/i.test(p));
  const status = await publish(id, doubtful ? 1 : config["exam.bank.humanReviewSample"]);
  return { itemSetId: id, status, topic: block.data.topic, issues: [], costMicroUsd: cost };
}

/** Aprobado directo o a la muestra de revision humana. */
async function publish(id: string, reviewSample: number): Promise<"APPROVED" | "REVIEW"> {
  const status = Math.random() < reviewSample ? "REVIEW" : "APPROVED";
  await db.examItemSet.update({
    where: { id },
    data: { status, approvedAt: status === "APPROVED" ? new Date() : null },
  });
  return status;
}

/**
 * (Re)genera los audios de un bloque de Listening a partir del guion guardado en la
 * clave. Lo usan el pipeline, el trabajo `bank.audio` y el boton del admin.
 */
export async function attachAudio(
  itemSetId: string,
  opts: { publishWhenOk?: boolean } = {},
): Promise<{ status: "OK" | "REJECTED" | "FAILED"; issues: string[]; costMicroUsd: bigint }> {
  const item = await db.examItemSet.findUniqueOrThrow({ where: { id: itemSetId }, include: { audio: true } });
  const key = item.answerKey as unknown as Pick<ListeningBlock, "speakers" | "segments">;
  if (!key?.segments?.length) throw new Error("El bloque no tiene guion de audio");
  const config = await getConfig();
  let segments;
  try {
    segments = await synthesizeListening({
      exam: item.exam,
      language: examSpec(item.exam).language,
      itemSetId,
      block: { speakers: key.speakers, segments: key.segments } as ListeningBlock,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.examItemSet.update({ where: { id: itemSetId }, data: { reviewNote: `Audio pendiente: ${msg}`.slice(0, 4000) } });
    return { status: "FAILED", issues: [msg], costMicroUsd: BigInt(0) };
  }
  const cost = segments.reduce((s, x) => s + x.costMicroUsd, BigInt(0));
  await db.$transaction([
    db.audioAsset.deleteMany({ where: { itemSetId, storageKey: { notIn: segments.map((s) => s.storageKey) } } }),
    ...segments.map((s) =>
      db.audioAsset.upsert({
        where: { storageKey: s.storageKey },
        create: {
          itemSetId,
          storageKey: s.storageKey,
          durationMs: s.durationMs,
          voices: s.voices,
          script: s.script,
          transcriptCheck: s.transcriptCheck,
          characters: s.characters,
          costMicroUsd: s.costMicroUsd,
        },
        update: {
          durationMs: s.durationMs,
          voices: s.voices,
          script: s.script,
          transcriptCheck: s.transcriptCheck,
          characters: s.characters,
          costMicroUsd: s.costMicroUsd,
        },
      }),
    ),
    db.examItemSet.update({ where: { id: itemSetId }, data: { costMicroUsd: { increment: cost } } }),
  ]);
  const min = config["exam.bank.audioMinMatch"];
  const bad = segments.filter((s) => s.transcriptCheck < min);
  if (bad.length) {
    const issues = bad.map((s) => `Audio ${s.index + 1}: solo ${(s.transcriptCheck * 100).toFixed(0)} % del guion se reconoce (mínimo ${(min * 100).toFixed(0)} %).`);
    await db.examItemSet.update({ where: { id: itemSetId }, data: { status: "REJECTED", reviewNote: issues.join("\n") } });
    return { status: "REJECTED", issues, costMicroUsd: cost };
  }
  await db.examItemSet.update({ where: { id: itemSetId }, data: { reviewNote: null } });
  // Los bloques escritos por el equipo (importados) no pasan por la muestra aleatoria de revision.
  const authored = (item.answerKey as { source?: { kind?: string } } | null)?.source?.kind === "authored";
  if (opts.publishWhenOk && item.status === "DRAFT") await publish(itemSetId, authored ? 0 : config["exam.bank.humanReviewSample"]);
  return { status: "OK", issues: [], costMicroUsd: cost };
}
