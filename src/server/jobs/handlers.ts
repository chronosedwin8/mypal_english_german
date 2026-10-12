/**
 * Ejecucion de los trabajos de la cola (los toma el worker). Cada tipo tiene su
 * manejador; los tipos sin manejador todavia no se reclaman.
 */
import { z } from "zod";

import { EXAM_CODES } from "@/content/exams";
import { db } from "@/server/db";
import { attachAudio, produceBlock } from "@/server/exams/bank/pipeline";
import { gradeSpeaking } from "@/server/exams/speaking";
import { gradeWriting } from "@/server/exams/writing";

import { claimJobs, completeJob, failJob, type JobType } from "./queue";

type Handler = (payload: unknown, job: { attempts: number }) => Promise<Record<string, unknown>>;

/** Intentos por trabajo antes de quedar FAILED (debe coincidir con failJob). */
const MAX_ATTEMPTS = 3;

const GeneratePayload = z.object({
  exam: z.enum(EXAM_CODES as [string, ...string[]]),
  section: z.enum(["LISTENING", "READING", "WRITING", "SPEAKING"]),
  part: z.number().int().min(1),
  targetBand: z.number().optional(),
  domain: z.string().optional(),
});

const HANDLERS: Partial<Record<JobType, Handler>> = {
  "bank.generate": async (payload) => {
    const p = GeneratePayload.parse(payload);
    const r = await produceBlock({ ...p, exam: p.exam as never });
    return { itemSetId: r.itemSetId, status: r.status, topic: r.topic, issues: r.issues.slice(0, 10), costMicroUsd: String(r.costMicroUsd) };
  },
  "bank.audio": async (payload) => {
    const { itemSetId } = z.object({ itemSetId: z.string() }).parse(payload);
    // Si ya se resolvio (p. ej. desde el admin o la terminal), no se vuelve a sintetizar.
    const item = await db.examItemSet.findUnique({ where: { id: itemSetId }, select: { status: true } });
    if (item?.status !== "DRAFT") return { skipped: true, status: item?.status ?? "MISSING" };
    const r = await attachAudio(itemSetId, { publishWhenOk: true });
    // Falla temporal (red, cuota): se lanza para que la cola reintente.
    if (r.status === "FAILED") throw new Error(r.issues.join("; "));
    return { status: r.status, issues: r.issues, costMicroUsd: String(r.costMicroUsd) };
  },
  "speaking.grade": async (payload, job) => {
    const { submissionId } = z.object({ submissionId: z.string() }).parse(payload);
    return gradeSpeaking(submissionId, { finalAttempt: job.attempts >= MAX_ATTEMPTS });
  },
  "writing.grade": async (payload, job) => {
    const { submissionId } = z.object({ submissionId: z.string() }).parse(payload);
    return gradeWriting(submissionId, { finalAttempt: job.attempts >= MAX_ATTEMPTS });
  },
};

export const HANDLED_JOB_TYPES = Object.keys(HANDLERS) as JobType[];

/** Toma y ejecuta hasta `limit` trabajos en paralelo. Devuelve cuantos proceso. */
export async function processJobs(limit = 2): Promise<number> {
  const jobs = await claimJobs(limit, HANDLED_JOB_TYPES);
  await Promise.all(
    jobs.map(async (job) => {
      const handler = HANDLERS[job.type as JobType];
      try {
        if (!handler) throw new Error(`Sin manejador para ${job.type}`);
        await completeJob(job.id, await handler(job.payload, job));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[jobs] ${job.type} ${job.id}: ${msg.slice(0, 300)}`);
        await failJob(job.id, msg, MAX_ATTEMPTS);
      }
    }),
  );
  return jobs.length;
}
