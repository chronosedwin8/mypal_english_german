/**
 * Cola de trabajos en Postgres (FOR UPDATE SKIP LOCKED): generar bloques del banco,
 * calificar Writing/Speaking, recalcular planes. Asi una calificacion de 30–60 s no
 * frena a los vigilantes de clases del worker.
 */
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

export type JobType =
  | "bank.generate"
  | "bank.audio"
  | "writing.grade"
  | "speaking.grade"
  | "exam.finalize"
  | "study.replan";

export async function enqueue(type: JobType, payload: Record<string, unknown>, opts: { dedupeKey?: string; runAfter?: Date } = {}) {
  if (opts.dedupeKey) {
    const existing = await db.examJob.findUnique({ where: { dedupeKey: opts.dedupeKey } });
    if (existing) return existing;
  }
  try {
    return await db.examJob.create({
      data: {
        type,
        payload: payload as Prisma.InputJsonValue,
        dedupeKey: opts.dedupeKey ?? null,
        runAfter: opts.runAfter ?? new Date(),
      },
    });
  } catch (err) {
    if (opts.dedupeKey) return db.examJob.findUniqueOrThrow({ where: { dedupeKey: opts.dedupeKey } });
    throw err;
  }
}

/** Reserva hasta `limit` trabajos listos (nadie mas los toma). */
export async function claimJobs(limit: number, types?: JobType[]) {
  const allTypes = types ?? ["bank.generate", "bank.audio", "writing.grade", "speaking.grade", "exam.finalize", "study.replan"];
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "ExamJob" SET status = 'RUNNING', "lockedAt" = clock_timestamp(), attempts = attempts + 1, "updatedAt" = clock_timestamp()
    WHERE id IN (
      SELECT id FROM "ExamJob"
      WHERE status = 'QUEUED' AND "runAfter" <= clock_timestamp() AND type = ANY(${allTypes}::text[])
      ORDER BY "runAfter" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  if (!rows.length) return [];
  return db.examJob.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
}

export async function completeJob(id: string, result: Record<string, unknown> = {}) {
  await db.examJob.update({ where: { id }, data: { status: "DONE", result: result as Prisma.InputJsonValue, lockedAt: null } });
}

/** Reintenta con espera creciente; despues de `maxAttempts` queda FAILED. */
export async function failJob(id: string, error: string, maxAttempts = 3) {
  const job = await db.examJob.findUnique({ where: { id } });
  if (!job) return;
  const retry = job.attempts < maxAttempts;
  await db.examJob.update({
    where: { id },
    data: {
      status: retry ? "QUEUED" : "FAILED",
      error: error.slice(0, 1000),
      lockedAt: null,
      runAfter: new Date(Date.now() + 30_000 * 2 ** job.attempts),
    },
  });
}

/** Trabajos RUNNING abandonados (p. ej. el worker se reinicio) vuelven a la cola. */
export async function recoverStaleJobs(staleMinutes = 10) {
  await db.examJob.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - staleMinutes * 60_000) } },
    data: { status: "QUEUED", lockedAt: null },
  });
}
