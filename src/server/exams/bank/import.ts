/**
 * Carga de bloques escritos por el equipo (sin IA generativa):
 *   esquema completo → validacion con codigo → sin duplicados → guardar
 *   → audio con ElevenLabs verificado con Scribe (Listening) → aprobado o a revision.
 * Un bloque con problemas no se guarda: se corrige el archivo y se vuelve a importar.
 */
import { createHash } from "node:crypto";

import { z } from "zod";

import { isExamCode } from "@/content/exams";
import type { ExamCode, ExamSectionCode } from "@/content/exams/types";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { enqueue } from "@/server/jobs/queue";

import { attachAudio } from "./pipeline";
import { SCHEMA_BY_KIND, splitBlock, type AnyBlock, type BankKind } from "./schemas";
import { bankKind, targetSpecs } from "./targets";
import { validateBlock } from "./validators";
import { GERMAN_TARGET_BAND } from "../profiles";

export const IMPORT_VERSION = "import-v1";

export const ImportEntrySchema = z.object({
  exam: z.string().refine(isExamCode, "Examen desconocido"),
  section: z.enum(["LISTENING", "READING", "WRITING", "SPEAKING"]),
  part: z.number().int().min(1),
  /** dificultad en la escala del banco (banda IELTS); por defecto la del bloque */
  difficulty: z.number().min(3).max(9).optional(),
  block: z.unknown(),
});
export type ImportEntry = z.infer<typeof ImportEntrySchema>;

export interface ImportResult {
  label: string;
  status: "APPROVED" | "REVIEW" | "DRAFT" | "SKIPPED" | "INVALID" | "REJECTED";
  itemSetId?: string;
  issues: string[];
  costMicroUsd: bigint;
}

const TASK_TYPE_BY_KIND: Partial<Record<BankKind, string>> = {
  writing1: "GRAPH_REPORT",
  writing2: "ESSAY",
  speaking1: "SPEAKING_INTERVIEW",
  speaking2: "SPEAKING_LONG_TURN",
};

/** Huella del contenido: reimportar el mismo archivo no duplica bloques. */
export function blockHash(entry: { exam: string; section: string; part: number; block: unknown }): string {
  return createHash("sha256").update(JSON.stringify([entry.exam, entry.section, entry.part, entry.block])).digest("hex").slice(0, 32);
}

/** Revisa un bloque sin guardarlo. */
export function checkEntry(raw: unknown): { ok: true; entry: ImportEntry; block: AnyBlock } | { ok: false; label: string; issues: string[] } {
  const parsed = ImportEntrySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, label: "(entrada)", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const entry = parsed.data;
  const exam = entry.exam as ExamCode;
  const label = `${exam} ${entry.section} ${entry.part}`;
  const kind = bankKind(exam, entry.section, entry.part);
  if (!kind) return { ok: false, label, issues: ["Esa parte no lleva bloques en el banco."] };
  const data = (SCHEMA_BY_KIND[kind] as z.ZodType<AnyBlock["data"]>).safeParse(entry.block);
  if (!data.success) return { ok: false, label, issues: data.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const block = { kind, data: data.data } as AnyBlock;
  const { section, part } = targetSpecs({ exam, section: entry.section, part: entry.part });
  const issues = validateBlock(block, section, part);
  return issues.length ? { ok: false, label: `${label} · ${block.data.topic}`, issues } : { ok: true, entry, block };
}

export async function importEntry(raw: unknown, opts: { review?: boolean; dryRun?: boolean } = {}): Promise<ImportResult> {
  const checked = checkEntry(raw);
  if (!checked.ok) return { label: checked.label, status: "INVALID", issues: checked.issues, costMicroUsd: BigInt(0) };
  const { entry, block } = checked;
  const exam = entry.exam as ExamCode;
  const section = entry.section as ExamSectionCode;
  const label = `${exam} ${section} ${entry.part} · ${block.data.topic}`;
  const hash = blockHash(entry);

  const existing = await db.examItemSet.findFirst({
    where: { exam, section, part: entry.part, answerKey: { path: ["source", "hash"], equals: hash } },
    select: { id: true, status: true },
  });
  if (existing) return { label, status: "SKIPPED", itemSetId: existing.id, issues: [`Ya importado (${existing.status}).`], costMicroUsd: BigInt(0) };
  if (opts.dryRun) return { label, status: "SKIPPED", issues: ["Válido (simulación: no se guardó)."], costMicroUsd: BigInt(0) };

  const { part } = targetSpecs({ exam, section, part: entry.part });
  const { content, answerKey } = splitBlock(block);
  const difficulty = entry.difficulty ?? (exam === "IELTS_ACADEMIC" ? block.data.targetBand : GERMAN_TARGET_BAND[exam]);
  const taskTypes =
    block.kind === "reading" || block.kind === "listening"
      ? [...new Set(block.data.groups.map((g) => g.taskType))]
      : TASK_TYPE_BY_KIND[block.kind]
        ? [TASK_TYPE_BY_KIND[block.kind]!]
        : part.taskTypes;
  const item = await db.examItemSet.create({
    data: {
      exam,
      section,
      part: entry.part,
      taskTypes,
      difficulty,
      topic: block.data.topic.slice(0, 120),
      content: content as Prisma.InputJsonValue,
      answerKey: { ...answerKey, source: { hash, kind: "authored" } } as Prisma.InputJsonValue,
      status: "DRAFT",
      promptVersion: IMPORT_VERSION,
      model: "autor",
    },
  });
  await db.auditLog.create({ data: { action: "bank.import", entity: "ExamItemSet", entityId: item.id, after: { exam, section, part: entry.part, topic: block.data.topic } } });

  let cost = BigInt(0);
  if (block.kind === "listening") {
    const audio = await attachAudio(item.id);
    cost = audio.costMicroUsd;
    if (audio.status === "FAILED") {
      await enqueue("bank.audio", { itemSetId: item.id }, { dedupeKey: `audio:${item.id}`, runAfter: new Date(Date.now() + 10 * 60_000) });
      return { label, status: "DRAFT", itemSetId: item.id, issues: audio.issues, costMicroUsd: cost };
    }
    if (audio.status === "REJECTED") return { label, status: "REJECTED", itemSetId: item.id, issues: audio.issues, costMicroUsd: cost };
  }
  const status = opts.review ? "REVIEW" : "APPROVED";
  await db.examItemSet.update({ where: { id: item.id }, data: { status, approvedAt: status === "APPROVED" ? new Date() : null } });
  return { label, status, itemSetId: item.id, issues: [], costMicroUsd: cost };
}
