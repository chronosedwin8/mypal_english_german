"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { EXAM_CODES } from "@/content/exams";
import { requireAdmin } from "@/server/auth/dal";
import { db } from "@/server/db";
import { createInvitation, createOrganization, sendInvitationEmail } from "@/server/org";

export async function createOrgAction(formData: FormData) {
  const admin = await requireAdmin();
  const input = z
    .object({ name: z.string().trim().min(2).max(120), type: z.enum(["SCHOOL", "UNIVERSITY", "COMPANY"]), adminEmail: z.string().trim().email() })
    .parse(Object.fromEntries(formData));
  const exams = formData.getAll("exams").map(String).filter((e) => (EXAM_CODES as string[]).includes(e));
  const org = await createOrganization({ name: input.name, type: input.type, enabledExams: exams as never });
  const inv = await createInvitation({ orgId: org.id, role: "ORG_ADMIN", email: input.adminEmail, days: 30, createdBy: admin.id });
  await sendInvitationEmail(inv.id);
  await db.auditLog.create({ data: { actorUserId: admin.id, action: "org.create", entity: "Organization", entityId: org.id, after: { ...input, exams } } });
  revalidatePath("/admin/instituciones");
  redirect(`/admin/instituciones?aviso=${encodeURIComponent(`${org.name} creada. Invitación enviada a ${input.adminEmail}.`)}`);
}

export async function updateLeadAction(formData: FormData) {
  const admin = await requireAdmin();
  const input = z.object({ id: z.string(), status: z.enum(["NEW", "CONTACTED", "WON", "LOST"]) }).parse(Object.fromEntries(formData));
  await db.institutionLead.update({ where: { id: input.id }, data: { status: input.status } });
  await db.auditLog.create({ data: { actorUserId: admin.id, action: "lead.status", entity: "InstitutionLead", entityId: input.id, after: input } });
  revalidatePath("/admin/instituciones");
}
