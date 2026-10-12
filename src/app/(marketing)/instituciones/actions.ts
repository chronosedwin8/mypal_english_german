"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { EXAM_CODES } from "@/content/exams";
import { db } from "@/server/db";

const LeadSchema = z.object({
  institution: z.string().trim().min(2).max(120),
  type: z.enum(["SCHOOL", "UNIVERSITY", "COMPANY"]),
  contactName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  phone: z.string().trim().max(30).optional(),
  students: z.coerce.number().int().min(1).max(100_000),
  message: z.string().trim().max(1000).optional(),
});

export async function requestDemoAction(formData: FormData) {
  // Campo trampa: los robots lo llenan, las personas no lo ven.
  if (String(formData.get("website") ?? "")) redirect("/instituciones?enviado=1");
  const parsed = LeadSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) redirect(`/instituciones?error=${encodeURIComponent("Revisa los datos del formulario.")}#demo`);
  const exams = formData.getAll("exams").map(String).filter((e) => (EXAM_CODES as string[]).includes(e));
  const recent = await db.institutionLead.count({ where: { email: parsed.data.email.toLowerCase(), createdAt: { gt: new Date(Date.now() - 86_400_000) } } });
  if (recent < 3)
    await db.institutionLead.create({ data: { ...parsed.data, email: parsed.data.email.toLowerCase(), exams, phone: parsed.data.phone ?? null, message: parsed.data.message ?? null } });
  redirect("/instituciones?enviado=1#demo");
}
