"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { EXAM_CODES } from "@/content/exams";
import { requireAdmin } from "@/server/auth/dal";
import { db } from "@/server/db";
import { calibrateBank } from "@/server/exams/calibration";
import { assembleForm } from "@/server/exams/forms";
import { enqueue } from "@/server/jobs/queue";

const ExamCodeSchema = z.enum(EXAM_CODES as [string, ...string[]]);

export async function buildForm(formData: FormData) {
  const admin = await requireAdmin();
  const exam = ExamCodeSchema.parse(formData.get("exam"));
  const r = await assembleForm(exam as never);
  await db.auditLog.create({ data: { actorUserId: admin.id, action: "form.assemble", entity: "ExamForm", entityId: r.ok ? r.formId : null, after: r } });
  revalidatePath("/admin/examenes");
  const msg = r.ok ? `Forma ${r.version} creada.` : `Faltan bloques aprobados: ${r.missing.join(", ")}.`;
  redirect(`/admin/examenes?aviso=${encodeURIComponent(msg)}`);
}

export async function reviewBlock(formData: FormData) {
  const admin = await requireAdmin();
  const input = z
    .object({
      id: z.string().min(1),
      decision: z.enum(["APPROVED", "REJECTED", "RETIRED"]),
      note: z.string().trim().max(2000).optional(),
    })
    .parse(Object.fromEntries(formData));
  const before = await db.examItemSet.findUniqueOrThrow({ where: { id: input.id }, select: { status: true } });
  await db.examItemSet.update({
    where: { id: input.id },
    data: {
      status: input.decision,
      approvedAt: input.decision === "APPROVED" ? new Date() : undefined,
      reviewNote: input.note ? `${input.note} — revisión humana` : undefined,
    },
  });
  await db.auditLog.create({
    data: { actorUserId: admin.id, action: "bank.review", entity: "ExamItemSet", entityId: input.id, before, after: input },
  });
  revalidatePath("/admin/examenes");
  revalidatePath(`/admin/examenes/${input.id}`);
}

export async function regenerateAudio(formData: FormData) {
  const admin = await requireAdmin();
  const id = z.string().min(1).parse(formData.get("id"));
  // Sale del banco mientras se rehace el audio; al terminar vuelve a publicarse.
  await db.examItemSet.update({ where: { id }, data: { status: "DRAFT", approvedAt: null } });
  await enqueue("bank.audio", { itemSetId: id }, { dedupeKey: `audio:${id}:${Date.now()}` });
  await db.auditLog.create({ data: { actorUserId: admin.id, action: "bank.audio", entity: "ExamItemSet", entityId: id } });
  revalidatePath(`/admin/examenes/${id}`);
}

export async function runCalibration() {
  const admin = await requireAdmin();
  const summary = await calibrateBank();
  await db.auditLog.create({ data: { actorUserId: admin.id, action: "exam.calibrate", entity: "ExamItemStat", after: summary as never } });
  revalidatePath("/admin/calibracion");
  const moved = summary.reduce((a, s) => a + s.sentToReview, 0);
  const forms = summary.reduce((a, s) => a + s.formsCalibrated, 0);
  redirect(`/admin/calibracion?aviso=${encodeURIComponent(`Calibración lista: ${moved} bloques a revisión, ${forms} formas calibradas.`)}`);
}
