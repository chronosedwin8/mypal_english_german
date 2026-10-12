/**
 * Inventario del banco y reposicion: si una parte tiene menos bloques publicables
 * que `exam.bank.minPerPart`, se encolan trabajos `bank.generate` (sin duplicar los
 * que ya estan en cola).
 */
import type { ExamCode } from "@/content/exams/types";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { enqueue } from "@/server/jobs/queue";

import { BANK_EXAMS, bankTargets, type BankTarget } from "./targets";

export interface InventoryRow extends BankTarget {
  approved: number;
  review: number;
  draft: number;
  rejected: number;
  retired: number;
  pending: number;
}

const keyOf = (t: { exam: string; section: string; part: number }) => `${t.exam}:${t.section}:${t.part}`;

export async function bankInventory(exams: ExamCode[] = BANK_EXAMS): Promise<InventoryRow[]> {
  const [counts, jobs] = await Promise.all([
    db.examItemSet.groupBy({ by: ["exam", "section", "part", "status"], where: { exam: { in: exams } }, _count: true }),
    db.examJob.findMany({ where: { type: "bank.generate", status: { in: ["QUEUED", "RUNNING"] } }, select: { payload: true } }),
  ]);
  const pending = new Map<string, number>();
  for (const j of jobs) {
    const p = j.payload as { exam?: string; section?: string; part?: number };
    if (p.exam && p.section && p.part) pending.set(keyOf(p as never), (pending.get(keyOf(p as never)) ?? 0) + 1);
  }
  return exams.flatMap((exam) =>
    bankTargets(exam).map((t) => {
      const n = (status: string) =>
        counts.filter((c) => c.exam === t.exam && c.section === t.section && c.part === t.part && c.status === status).reduce((s, c) => s + c._count, 0);
      return {
        ...t,
        approved: n("APPROVED"),
        review: n("REVIEW"),
        draft: n("DRAFT"),
        rejected: n("REJECTED"),
        retired: n("RETIRED"),
        pending: pending.get(keyOf(t)) ?? 0,
      };
    }),
  );
}

/** Encola lo que falta para llegar al minimo por parte. Devuelve cuantos trabajos encolo. */
export async function planBankGaps(opts: { maxJobs?: number } = {}): Promise<number> {
  const config = await getConfig();
  const min = config["exam.bank.minPerPart"];
  const enabled = config["exam.enabledExams"].filter((e) => BANK_EXAMS.includes(e));
  let budget = opts.maxJobs ?? 6;
  let created = 0;
  for (const row of await bankInventory(enabled)) {
    // Los borradores esperan audio: cuentan como inventario en camino.
    const need = min - (row.approved + row.review + row.draft) - row.pending;
    for (let i = 0; i < need && budget > 0; i++, budget--) {
      await enqueue("bank.generate", { exam: row.exam, section: row.section, part: row.part });
      created++;
    }
  }
  return created;
}
