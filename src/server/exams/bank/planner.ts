/**
 * Inventario del banco por examen, seccion y parte. El contenido del banco lo escribe
 * el equipo y se carga con `pnpm bank import`; la API de IA no se usa para crearlo.
 */
import type { ExamCode } from "@/content/exams/types";
import { db } from "@/server/db";

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
