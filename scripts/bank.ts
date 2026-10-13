/**
 * Banco de examenes desde la terminal. El contenido lo escribe el equipo (no la API de IA)
 * y vive en `bank-src/` (fuera de git: el repositorio es publico y ahi estan las claves).
 *
 *   pnpm bank inventory                          # bloques por parte y estado
 *   pnpm bank import <archivo.json|carpeta> [--dry-run] [--review]
 *   pnpm bank form [--exam GOETHE_B2]            # arma una forma de simulacro con bloques no usados
 *   pnpm bank audio <itemSetId>                  # regenera el audio de un bloque de Listening
 *
 * Formato: un arreglo JSON de { exam, section, part, difficulty?, block } (ver src/server/exams/bank/import.ts).
 */
import "dotenv/config";

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { isExamCode } from "@/content/exams";
import type { ExamCode } from "@/content/exams/types";
import { spentTodayMicroUsd } from "@/server/ai/usage";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { importEntry } from "@/server/exams/bank/import";
import { attachAudio } from "@/server/exams/bank/pipeline";
import { bankInventory } from "@/server/exams/bank/planner";
import { BANK_EXAMS } from "@/server/exams/bank/targets";
import { assembleForm } from "@/server/exams/forms";

const args = process.argv.slice(2);
const has = (name: string) => args.includes(`--${name}`);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const usd = (micro: bigint) => `$${(Number(micro) / 1e6).toFixed(3)}`;

function examArg(): ExamCode {
  const e = flag("exam") ?? "IELTS_ACADEMIC";
  if (!isExamCode(e) || !BANK_EXAMS.includes(e)) throw new Error(`Examen sin banco: ${e}. Disponibles: ${BANK_EXAMS.join(", ")}`);
  return e;
}

async function jsonFiles(target: string): Promise<string[]> {
  const s = await stat(target);
  if (s.isFile()) return [target];
  const out: string[] = [];
  for (const name of (await readdir(target)).sort()) {
    const full = path.join(target, name);
    if ((await stat(full)).isDirectory()) out.push(...(await jsonFiles(full)));
    else if (name.endsWith(".json")) out.push(full);
  }
  return out;
}

async function importPaths(targets: string[]) {
  const totals: Record<string, number> = {};
  let cost = BigInt(0);
  for (const target of targets)
    for (const file of await jsonFiles(target)) {
      const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
      const entries = Array.isArray(raw) ? raw : [raw];
      console.log(`\n${path.relative(process.cwd(), file)} · ${entries.length} bloque(s)`);
      for (const entry of entries) {
        const r = await importEntry(entry, { review: has("review"), dryRun: has("dry-run") });
        totals[r.status] = (totals[r.status] ?? 0) + 1;
        cost += r.costMicroUsd;
        console.log(`  ${r.status.padEnd(8)} ${r.label}${r.costMicroUsd ? ` · voz ${usd(r.costMicroUsd)}` : ""}`);
        for (const issue of r.issues.slice(0, 12)) console.log(`    - ${issue}`);
      }
    }
  console.log(`\nResumen: ${Object.entries(totals).map(([k, v]) => `${k} ${v}`).join(" · ")} · voz ${usd(cost)}`);
  if (totals.INVALID || totals.REJECTED) process.exitCode = 1;
}

async function main() {
  const positional = args.filter((a, i) => !a.startsWith("--") && !(args[i - 1] === "--exam"));
  const [cmd, ...rest] = positional;
  switch (cmd) {
    case "inventory": {
      const min = (await getConfig())["exam.bank.minPerPart"];
      console.log(`Mínimo por parte: ${min}\n`);
      console.table(
        (await bankInventory(flag("exam") ? [examArg()] : undefined)).map((r) => ({
          examen: r.exam,
          seccion: r.section,
          parte: r.part,
          aprobados: r.approved,
          revision: r.review,
          borrador: r.draft,
          rechazados: r.rejected,
        })),
      );
      console.log(`Gasto de IA y voz hoy: ${usd(await spentTodayMicroUsd())}`);
      break;
    }
    case "import": {
      if (!rest.length) throw new Error("Uso: pnpm bank import <archivo.json|carpeta> [--dry-run] [--review]");
      await importPaths(rest);
      break;
    }
    case "form": {
      const r = await assembleForm(examArg());
      if (r.ok) console.log(`Forma ${r.version} creada (${r.formId}).`);
      else console.log(`Faltan bloques aprobados: ${r.missing.join(", ")}`);
      break;
    }
    case "audio": {
      const r = await attachAudio(rest[0], { publishWhenOk: true });
      console.log(`${r.status} · ${usd(r.costMicroUsd)}`, r.issues);
      break;
    }
    default:
      console.log("Comandos: inventory · import <archivo|carpeta> · form · audio <id>");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
