import "server-only";

import { REPORT_REASONS, type ReportReason } from "@/lib/exams/report-reasons";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";


export class ReportError extends Error {
  constructor(
    public code: "NOT_FOUND" | "DUPLICATE",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Un estudiante reporta una pregunta que ya respondio. Un reporte por persona y pregunta;
 * cuando suficientes personas distintas reportan el mismo bloque, sale de circulacion
 * (APPROVED → REVIEW) hasta que un administrador lo revise.
 */
export async function reportQuestion(
  userId: string,
  input: { attemptId: string; itemSetId: string; questionNumber: number; reason: ReportReason; note?: string },
): Promise<{ sentToReview: boolean }> {
  const seen = await db.examResponse.findFirst({
    where: { attemptId: input.attemptId, itemSetId: input.itemSetId, attempt: { userId } },
    select: { attempt: { select: { exam: true } } },
  });
  if (!seen) throw new ReportError("NOT_FOUND", "No encontramos esa pregunta en tus prácticas.");
  const refId = `${input.itemSetId}#${input.questionNumber}`;
  const dup = await db.moderationFlag.findFirst({ where: { kind: "QUESTION", refId, userId } });
  if (dup) throw new ReportError("DUPLICATE", "Ya reportaste esta pregunta. Gracias: la estamos revisando.");

  const config = await getConfig();
  return db.$transaction(async (tx) => {
    await tx.moderationFlag.create({
      data: {
        kind: "QUESTION",
        refId,
        userId,
        severity: input.reason === "WRONG_KEY" ? "HIGH" : "MEDIUM",
        note: `${seen.attempt.exam} · pregunta ${input.questionNumber} · ${REPORT_REASONS[input.reason]}${input.note ? `\n${input.note}` : ""}`,
      },
    });
    const reporters = await tx.moderationFlag.groupBy({
      by: ["userId"],
      where: { kind: "QUESTION", status: "OPEN", refId: { startsWith: `${input.itemSetId}#` } },
    });
    if (reporters.length < config["exam.reportsToReview"]) return { sentToReview: false };
    const moved = await tx.examItemSet.updateMany({
      where: { id: input.itemSetId, status: "APPROVED" },
      data: { status: "REVIEW", reviewNote: `Retirado de circulación: ${reporters.length} estudiantes lo reportaron.` },
    });
    if (moved.count) {
      await tx.auditLog.create({
        data: { action: "exam.item_reported_to_review", entity: "ExamItemSet", entityId: input.itemSetId, after: { reporters: reporters.length } },
      });
    }
    return { sentToReview: moved.count > 0 };
  });
}
