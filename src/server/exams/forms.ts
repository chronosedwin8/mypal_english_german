/**
 * Formas de simulacro: un bloque aprobado por parte, sin repetir bloques entre formas.
 * La dificultad sube de parte en parte, como en el examen real.
 */
import type { ExamCode, ExamSectionCode } from "@/content/exams/types";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";

import { bankTargets } from "./bank/targets";

export interface FormBlocks {
  sections: { section: ExamSectionCode; parts: { part: number; itemSetId: string }[] }[];
}

export function formItemSetIds(blocks: unknown): string[] {
  const b = blocks as FormBlocks;
  return (b?.sections ?? []).flatMap((s) => s.parts.map((p) => p.itemSetId));
}

export async function assembleForm(
  exam: ExamCode,
): Promise<{ ok: true; formId: string; version: number } | { ok: false; missing: string[] }> {
  const bands = [...(await getConfig())["exam.bank.targetBands"]].sort((a, b) => a - b);
  const forms = await db.examForm.findMany({ where: { exam }, select: { blocks: true, version: true } });
  const used = new Set(forms.flatMap((f) => formItemSetIds(f.blocks)));
  const targets = bankTargets(exam);

  const candidates = await db.examItemSet.findMany({
    where: { exam, status: "APPROVED", id: { notIn: [...used] } },
    select: { id: true, section: true, part: true, difficulty: true },
  });

  const sections: FormBlocks["sections"] = [];
  const missing: string[] = [];
  for (const t of targets) {
    const sameSection = targets.filter((x) => x.section === t.section);
    const position = sameSection.findIndex((x) => x.part === t.part);
    // parte 1 → banda baja … ultima parte → banda alta
    const desired = bands[Math.round((position / Math.max(sameSection.length - 1, 1)) * (bands.length - 1))];
    const pool = candidates
      .filter((c) => c.section === t.section && c.part === t.part)
      .sort((a, b) => Math.abs(a.difficulty - desired) - Math.abs(b.difficulty - desired));
    if (!pool.length) {
      missing.push(`${t.section} parte ${t.part}`);
      continue;
    }
    let sec = sections.find((s) => s.section === t.section);
    if (!sec) sections.push((sec = { section: t.section, parts: [] }));
    sec.parts.push({ part: t.part, itemSetId: pool[0].id });
  }
  if (missing.length) return { ok: false, missing };

  const version = Math.max(0, ...forms.map((f) => f.version)) + 1;
  const form = await db.examForm.create({ data: { exam, version, blocks: { sections } as never } });
  return { ok: true, formId: form.id, version };
}
