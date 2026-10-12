"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { EXAM_CODES } from "@/content/exams";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { OrgError, addLicenses, createInvitation, removeMember, sendInvitationEmail } from "@/server/org";
import { createGroup } from "@/server/org/teaching";

/** Administrador de la institucion (o administrador de MyPAL). */
async function requireOrgAdmin(orgId: string) {
  const user = await requireUser("/institucion");
  if (user.role === "ADMIN") return { user, member: null };
  const member = await db.orgMember.findFirst({ where: { orgId, userId: user.id, status: "ACTIVE", role: "ORG_ADMIN" } });
  if (!member) throw new Error("No eres administrador de esta institución.");
  return { user, member };
}

function back(orgId: string, aviso?: string): never {
  revalidatePath("/institucion");
  redirect(`/institucion?org=${orgId}${aviso ? `&aviso=${encodeURIComponent(aviso)}` : ""}`);
}

export async function buyLicensesAction(formData: FormData) {
  const input = z
    .object({ orgId: z.string(), kind: z.enum(["estandar", "intensiva"]), seats: z.coerce.number().int().min(1).max(5000), months: z.coerce.number().int().min(1).max(24) })
    .parse(Object.fromEntries(formData));
  const { user } = await requireOrgAdmin(input.orgId);
  await addLicenses({ orgId: input.orgId, kind: input.kind, seats: input.seats, months: input.months });
  await db.auditLog.create({ data: { actorUserId: user.id, action: "org.licenses", entity: "Organization", entityId: input.orgId, after: input } });
  back(input.orgId, `${input.seats} licencias agregadas (pago simulado).`);
}

export async function createGroupAction(formData: FormData) {
  const input = z
    .object({
      orgId: z.string(),
      name: z.string().trim().min(2).max(80),
      exam: z.enum(EXAM_CODES as [string, ...string[]]),
      targetDate: z.string().optional(),
      targetScore: z.coerce.number().min(0).max(100).optional(),
    })
    .parse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  const { member } = await requireOrgAdmin(input.orgId);
  await createGroup({
    orgId: input.orgId,
    name: input.name,
    exam: input.exam as never,
    targetDate: input.targetDate ? new Date(`${input.targetDate}T12:00:00Z`) : null,
    targetScore: input.targetScore ?? null,
    teacherMemberId: member?.id,
  });
  back(input.orgId, "Grupo creado.");
}

export async function inviteAction(formData: FormData) {
  const input = z
    .object({
      orgId: z.string(),
      role: z.enum(["ORG_ADMIN", "TEACHER", "STUDENT"]),
      groupId: z.string().optional(),
      email: z.string().email().optional(),
      maxUses: z.coerce.number().int().min(1).max(500).default(1),
    })
    .parse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  const { user } = await requireOrgAdmin(input.orgId);
  const inv = await createInvitation({ orgId: input.orgId, role: input.role, groupId: input.groupId, email: input.email, maxUses: input.email ? 1 : input.maxUses, createdBy: user.id });
  if (inv.email) await sendInvitationEmail(inv.id);
  back(input.orgId, inv.email ? `Invitación enviada a ${inv.email}.` : `Código creado: ${inv.code}`);
}

/** Carga masiva: una linea por persona "nombre, correo, grupo, fecha de nacimiento (AAAA-MM-DD, opcional)". */
export async function importCsvAction(formData: FormData) {
  const orgId = z.string().parse(formData.get("orgId"));
  const { user } = await requireOrgAdmin(orgId);
  const raw = String(formData.get("csv") ?? "");
  const groups = await db.group.findMany({ where: { orgId } });
  let ok = 0;
  const problems: string[] = [];
  for (const [i, line] of raw.split(/\r?\n/).entries()) {
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (!line.trim() || /^nombre/i.test(cells[0] ?? "")) continue;
    const [name, email, groupName, birth] = cells;
    if (!email || !z.string().email().safeParse(email).success) {
      problems.push(`línea ${i + 1}: correo no válido`);
      continue;
    }
    const group = groupName ? groups.find((g) => g.name.toLowerCase() === groupName.toLowerCase()) : undefined;
    if (groupName && !group) {
      problems.push(`línea ${i + 1}: no existe el grupo "${groupName}"`);
      continue;
    }
    const birthDate = birth ? new Date(`${birth}T00:00:00Z`) : null;
    try {
      const inv = await createInvitation({
        orgId,
        role: "STUDENT",
        groupId: group?.id,
        email,
        name,
        birthDate: birthDate && !Number.isNaN(birthDate.getTime()) ? birthDate : null,
        createdBy: user.id,
      });
      await sendInvitationEmail(inv.id);
      ok++;
    } catch (err) {
      problems.push(`línea ${i + 1}: ${err instanceof OrgError ? err.message : "error"}`);
    }
  }
  back(orgId, `${ok} invitaciones enviadas.${problems.length ? ` Revisa: ${problems.slice(0, 5).join("; ")}` : ""}`);
}

export async function removeMemberAction(formData: FormData) {
  const input = z.object({ orgId: z.string(), memberId: z.string() }).parse(Object.fromEntries(formData));
  const { user } = await requireOrgAdmin(input.orgId);
  await removeMember(input.orgId, input.memberId);
  await db.auditLog.create({ data: { actorUserId: user.id, action: "org.remove_member", entity: "OrgMember", entityId: input.memberId } });
  back(input.orgId, "La persona salió de la institución y su licencia quedó libre.");
}

export async function updateOrgSettingsAction(formData: FormData) {
  const input = z
    .object({
      orgId: z.string(),
      allowsMinors: z.string().optional(),
      minorsDeclaration: z.string().optional(),
      avatarForMinors: z.string().optional(),
      cameraAllowed: z.string().optional(),
      inactiveDays: z.coerce.number().int().min(1).max(60),
      riskBandGap: z.coerce.number().min(0).max(50),
      recordingsRetentionDays: z.coerce.number().int().min(7).max(730),
    })
    .parse(Object.fromEntries(formData));
  const { user } = await requireOrgAdmin(input.orgId);
  const org = await db.organization.findUniqueOrThrow({ where: { id: input.orgId } });
  const allowsMinors = input.allowsMinors === "on";
  if (allowsMinors && !org.minorsDeclarationAt && input.minorsDeclaration !== "on")
    back(input.orgId, "Para inscribir menores, confirma que la institución tiene la autorización de sus representantes.");
  await db.organization.update({
    where: { id: input.orgId },
    data: {
      allowsMinors,
      minorsDeclarationAt: allowsMinors ? (org.minorsDeclarationAt ?? new Date()) : org.minorsDeclarationAt,
      avatarForMinors: input.avatarForMinors === "on",
      cameraAllowed: input.cameraAllowed === "on",
      thresholds: { inactiveDays: input.inactiveDays, riskBandGap: input.riskBandGap },
      recordingsRetentionDays: input.recordingsRetentionDays,
    },
  });
  await db.auditLog.create({ data: { actorUserId: user.id, action: "org.settings", entity: "Organization", entityId: input.orgId, after: input } });
  back(input.orgId, "Configuración guardada.");
}
