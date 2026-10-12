"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { EXAM_CODES } from "@/content/exams";
import { requireAdmin } from "@/server/auth/dal";
import { db } from "@/server/db";
import { bankTargets } from "@/server/exams/bank/targets";
import { assembleForm } from "@/server/exams/forms";
import { enqueue } from "@/server/jobs/queue";

const ExamCodeSchema = z.enum(EXAM_CODES as [string, ...string[]]);

export async function enqueueGeneration(formData: FormData) {
  const admin = await requireAdmin();
  const input = z
    .object({
      exam: ExamCodeSchema,
      section: z.enum(["LISTENING", "READING", "WRITING", "SPEAKING"]),
      part: z.coerce.number().int().min(1),
      count: z.coerce.number().int().min(1).max(5).default(1),
    })
    .parse(Object.fromEntries(formData));
  if (!bankTargets(input.exam as never).some((t) => t.section === input.section && t.part === input.part))
    throw new Error("Esa parte no se genera en el banco");
  for (let i = 0; i < input.count; i++) await enqueue("bank.generate", { exam: input.exam, section: input.section, part: input.part });
  await db.auditLog.create({ data: { actorUserId: admin.id, action: "bank.enqueue", entity: "ExamItemSet", after: input } });
  revalidatePath("/admin/examenes");
}

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
