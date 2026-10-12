/**
 * Banco de examenes desde la terminal (gasta IA y voz; respeta los topes del admin).
 *
 *   pnpm bank inventory                         # bloques por parte y estado
 *   pnpm bank generate READING 1 [--count 2] [--band 6.5] [--domain "geology"] [--exam IELTS_ACADEMIC]
 *   pnpm bank fill [--max 6]                    # genera lo que falta hasta exam.bank.minPerPart
 *   pnpm bank form [--exam IELTS_ACADEMIC]      # arma una forma de simulacro con bloques no usados
 *   pnpm bank audio <itemSetId>                 # regenera el audio de un bloque de Listening
 */
import "dotenv/config";

import { isExamCode } from "@/content/exams";
import type { ExamCode, ExamSectionCode } from "@/content/exams/types";
import { spentTodayMicroUsd } from "@/server/ai/usage";
import { db } from "@/server/db";
import { bankInventory } from "@/server/exams/bank/planner";
import { attachAudio, produceBlock } from "@/server/exams/bank/pipeline";
import { BANK_EXAMS, bankTargets } from "@/server/exams/bank/targets";
import { assembleForm } from "@/server/exams/forms";
import { getConfig } from "@/server/config";

const args = process.argv.slice(2);
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

async function generate(exam: ExamCode, section: ExamSectionCode, part: number, count: number) {
  for (let i = 0; i < count; i++) {
    const t0 = Date.now();
    console.log(`→ ${exam} ${section} parte ${part} (${i + 1}/${count})…`);
    const r = await produceBlock({
      exam,
      section,
      part,
      targetBand: flag("band") ? Number(flag("band")) : undefined,
      domain: flag("domain"),
    });
    console.log(`  ${r.status} · "${r.topic}" · ${usd(r.costMicroUsd)} · ${((Date.now() - t0) / 1000).toFixed(0)} s · ${r.itemSetId}`);
    for (const issue of r.issues.slice(0, 8)) console.log(`    - ${issue}`);
  }
}

async function main() {
  const [cmd, ...rest] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  switch (cmd) {
    case "inventory": {
      const min = (await getConfig())["exam.bank.minPerPart"];
      console.log(`Mínimo por parte: ${min}\n`);
      console.table(
        (await bankInventory()).map((r) => ({
          examen: r.exam,
          seccion: r.section,
          parte: r.part,
          aprobados: r.approved,
          revision: r.review,
          borrador: r.draft,
          rechazados: r.rejected,
          en_cola: r.pending,
        })),
      );
      console.log(`Gasto de IA y voz hoy: ${usd(await spentTodayMicroUsd())}`);
      break;
    }
    case "generate": {
      const [section, part] = rest;
      const exam = examArg();
      const target = bankTargets(exam).find((t) => t.section === section && t.part === Number(part));
      if (!target) throw new Error(`Uso: pnpm bank generate <SECCION> <PARTE>. Opciones: ${bankTargets(exam).map((t) => `${t.section} ${t.part}`).join(" · ")}`);
      await generate(exam, target.section, target.part, Number(flag("count") ?? 1));
      break;
    }
    case "fill": {
      const min = (await getConfig())["exam.bank.minPerPart"];
      let budget = Number(flag("max") ?? 6);
      for (const row of await bankInventory()) {
        const need = Math.min(min - (row.approved + row.review + row.draft), budget);
        if (need <= 0) continue;
        await generate(row.exam, row.section, row.part, need);
        budget -= need;
        if (budget <= 0) break;
      }
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
      console.log("Comandos: inventory · generate <SECCION> <PARTE> · fill · form · audio <id>");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
