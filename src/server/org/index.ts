/**
 * Instituciones: organizaciones, licencias, membresias e invitaciones.
 * Cada estudiante activo ocupa una licencia y recibe los cupos de examen de su
 * licencia cada mes. Los docentes y administradores no ocupan licencia.
 */
import { randomBytes } from "node:crypto";

import { orgLicenseById } from "@/lib/pricing/catalog";
import type { ExamCode, OrgRole, OrgType, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { sendEmail } from "@/server/email";
import { grantQuota } from "@/server/exams/entitlements";

export class OrgError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "FORBIDDEN" | "NO_SEATS" | "INVALID" | "TOO_YOUNG" | "EXPIRED",
    message: string,
  ) {
    super(message);
    this.name = "OrgError";
  }
}

const DAY = 86_400_000;

export function ageOn(birthDate: Date, on = new Date()): number {
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = on.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}

function slugify(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "institucion"
  );
}

export function newCode(): string {
  // Sin caracteres ambiguos (0/O, 1/I): se dicta en clase.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
}

/* ───────────────────────── organizaciones y licencias ───────────────────────── */

export async function createOrganization(input: { name: string; type: OrgType; country?: string; taxId?: string; enabledExams: ExamCode[]; adminUserId?: string }) {
  let slug = slugify(input.name);
  if (await db.organization.findUnique({ where: { slug } })) slug = `${slug}-${newCode().slice(0, 4).toLowerCase()}`;
  return db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: input.name, slug, type: input.type, country: input.country ?? "CO", taxId: input.taxId, enabledExams: input.enabledExams },
    });
    if (input.adminUserId) await tx.orgMember.create({ data: { orgId: org.id, userId: input.adminUserId, role: "ORG_ADMIN" } });
    return org;
  });
}

/** Licencias compradas (hoy simuladas, como los pagos individuales). */
export async function addLicenses(input: { orgId: string; kind: string; seats: number; months: number; start?: Date }) {
  const def = orgLicenseById(input.kind);
  if (!def) throw new OrgError("INVALID", "Tipo de licencia desconocido.");
  if (input.seats < 1 || input.months < 1) throw new OrgError("INVALID", "Cantidad o meses no válidos.");
  const start = input.start ?? new Date();
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + input.months);
  return db.orgLicense.create({ data: { orgId: input.orgId, kind: def.id, seats: input.seats, priceUsdCents: def.priceUsdCents, periodStart: start, periodEnd: end } });
}

/** Cupos del mes en curso para un estudiante con licencia (idempotente por mes). */
export async function grantLicenseQuotas(memberId: string, now = new Date()) {
  const member = await db.orgMember.findUnique({ where: { id: memberId } });
  if (!member?.licenseId || member.status !== "ACTIVE") return;
  const lic = await db.orgLicense.findUnique({ where: { id: member.licenseId } });
  if (!lic || lic.periodEnd <= now || lic.periodStart > now) return;
  const def = orgLicenseById(lic.kind);
  if (!def) return;
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const periodEnd = monthEnd < lic.periodEnd ? monthEnd : lic.periodEnd;
  for (const [kind, amount] of Object.entries(def.examQuotas))
    await grantQuota({
      userId: member.userId,
      kind: kind as "MOCK" | "WRITING" | "SPEAKING",
      amount,
      periodStart: now,
      periodEnd,
      sourceKey: `license:${lic.id}:${member.id}:${month}:${kind}`,
    });
}

/** Ocupa una licencia libre para un estudiante (atomico: la base impide pasarse). */
async function occupySeat(tx: Prisma.TransactionClient, orgId: string, memberId: string) {
  const now = new Date();
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "OrgLicense" SET used = used + 1
    WHERE id = (
      SELECT id FROM "OrgLicense"
      WHERE "orgId" = ${orgId} AND used < seats AND "periodStart" <= ${now} AND "periodEnd" > ${now}
      ORDER BY "periodEnd" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  if (!rows.length) throw new OrgError("NO_SEATS", "La institución no tiene licencias disponibles. Pide a tu coordinación que agregue más.");
  await tx.orgMember.update({ where: { id: memberId }, data: { licenseId: rows[0].id } });
}

/* ───────────────────────── invitaciones y alta ───────────────────────── */

export async function createInvitation(input: {
  orgId: string;
  role: OrgRole;
  groupId?: string | null;
  email?: string | null;
  name?: string | null;
  birthDate?: Date | null;
  maxUses?: number;
  days?: number;
  createdBy?: string;
}) {
  if (input.birthDate && ageOn(input.birthDate) < 15) throw new OrgError("TOO_YOUNG", "La edad mínima es 15 años.");
  return db.invitation.create({
    data: {
      orgId: input.orgId,
      role: input.role,
      groupId: input.groupId ?? null,
      email: input.email?.toLowerCase() ?? null,
      name: input.name ?? null,
      birthDate: input.birthDate ?? null,
      maxUses: input.maxUses ?? 1,
      expiresAt: new Date(Date.now() + (input.days ?? 30) * DAY),
      code: newCode(),
      createdBy: input.createdBy,
    },
  });
}

export function invitationUrl(code: string) {
  return `${process.env.APP_URL ?? "http://localhost:3000"}/unirse/${code}`;
}

export async function sendInvitationEmail(invitationId: string) {
  const inv = await db.invitation.findUniqueOrThrow({ where: { id: invitationId }, include: { org: true } });
  if (!inv.email) return;
  const url = invitationUrl(inv.code);
  const role = inv.role === "TEACHER" ? "docente" : inv.role === "ORG_ADMIN" ? "administrador" : "estudiante";
  await sendEmail({
    to: inv.email,
    kind: "notice",
    subject: `${inv.org.name} te invita a MyPAL`,
    actionUrl: url,
    text: `Hola${inv.name ? ` ${inv.name}` : ""}, ${inv.org.name} te invita a MyPAL como ${role}. Únete aquí: ${url}`,
    html: `<p>Hola${inv.name ? ` ${inv.name.replace(/[<>&]/g, "")}` : ""},</p><p>${inv.org.name.replace(/[<>&]/g, "")} te invita a MyPAL como <b>${role}</b>.</p><p><a href="${url}">Unirme</a></p>`,
  });
}

export async function invitationInfo(code: string) {
  const inv = await db.invitation.findUnique({ where: { code: code.toUpperCase() }, include: { org: { select: { name: true, type: true, allowsMinors: true } } } });
  if (!inv) return null;
  const group = inv.groupId ? await db.group.findUnique({ where: { id: inv.groupId }, select: { name: true, exam: true } }) : null;
  return { ...inv, group, expired: inv.expiresAt < new Date() || inv.uses >= inv.maxUses };
}

/**
 * La persona (ya con cuenta) acepta la invitacion: entra a la institucion con su rol,
 * al grupo si lo hay y, si es estudiante, ocupa una licencia y recibe sus cupos.
 */
export async function acceptInvitation(input: { code: string; userId: string; email: string; birthDate?: Date | null }) {
  const memberId = await db.$transaction(async (tx) => {
    const inv = await tx.invitation.findUnique({ where: { code: input.code.toUpperCase() }, include: { org: true } });
    if (!inv) throw new OrgError("NOT_FOUND", "El código no existe.");
    if (inv.expiresAt < new Date() || inv.uses >= inv.maxUses) throw new OrgError("EXPIRED", "La invitación venció o ya se usó.");
    if (inv.email && inv.email !== input.email.toLowerCase()) throw new OrgError("FORBIDDEN", "Esta invitación es para otro correo.");
    const birthDate = inv.birthDate ?? input.birthDate ?? null;
    const age = birthDate ? ageOn(birthDate) : null;
    if (age !== null && age < 15) throw new OrgError("TOO_YOUNG", "La edad mínima es 15 años.");
    const isMinor = age !== null && age < 18;
    if (isMinor && !inv.org.allowsMinors) throw new OrgError("FORBIDDEN", "Esta institución no tiene habilitados estudiantes menores de edad.");

    const used = await tx.invitation.updateMany({ where: { id: inv.id, uses: { lt: inv.maxUses } }, data: { uses: { increment: 1 } } });
    if (!used.count) throw new OrgError("EXPIRED", "La invitación ya se usó.");

    const existing = await tx.orgMember.findUnique({ where: { orgId_userId: { orgId: inv.orgId, userId: input.userId } } });
    const member = existing
      ? await tx.orgMember.update({
          where: { id: existing.id },
          data: { status: "ACTIVE", removedAt: null, role: existing.role === "ORG_ADMIN" ? existing.role : inv.role, birthDate: birthDate ?? existing.birthDate, isMinor },
        })
      : await tx.orgMember.create({ data: { orgId: inv.orgId, userId: input.userId, role: inv.role, birthDate, isMinor } });
    if (member.role === "STUDENT" && !member.licenseId) await occupySeat(tx, inv.orgId, member.id);
    if (inv.groupId) {
      if (member.role === "TEACHER" || member.role === "ORG_ADMIN")
        await tx.groupTeacher.upsert({ where: { groupId_memberId: { groupId: inv.groupId, memberId: member.id } }, create: { groupId: inv.groupId, memberId: member.id }, update: {} });
      else await tx.groupStudent.upsert({ where: { groupId_memberId: { groupId: inv.groupId, memberId: member.id } }, create: { groupId: inv.groupId, memberId: member.id }, update: {} });
    }
    return member.id;
  });
  await grantLicenseQuotas(memberId);
  return memberId;
}

/** Retira a un estudiante: libera su licencia; su cuenta e historial siguen siendo suyos. */
export async function removeMember(orgId: string, memberId: string) {
  await db.$transaction(async (tx) => {
    const m = await tx.orgMember.findFirst({ where: { id: memberId, orgId, status: "ACTIVE" } });
    if (!m) throw new OrgError("NOT_FOUND", "No encontramos a esa persona.");
    if (m.licenseId) await tx.orgLicense.update({ where: { id: m.licenseId }, data: { used: { decrement: 1 } } });
    await tx.orgMember.update({ where: { id: m.id }, data: { status: "REMOVED", removedAt: new Date(), licenseId: null } });
    await tx.groupStudent.deleteMany({ where: { memberId: m.id } });
    await tx.groupTeacher.deleteMany({ where: { memberId: m.id } });
  });
}

/* ───────────────────────── contexto de la persona ───────────────────────── */

export async function membershipsOf(userId: string) {
  return db.orgMember.findMany({ where: { userId, status: "ACTIVE" }, include: { org: true } });
}

/** La persona es menor de edad en alguna institucion activa. */
export async function isMinorUser(userId: string): Promise<boolean> {
  return Boolean(await db.orgMember.findFirst({ where: { userId, status: "ACTIVE", isMinor: true }, select: { id: true } }));
}

/** Estudiante con licencia vigente (practica ilimitada, como un plan pago). */
export async function hasOrgLicense(userId: string, now = new Date()): Promise<boolean> {
  const m = await db.orgMember.findFirst({ where: { userId, status: "ACTIVE", licenseId: { not: null } }, select: { licenseId: true } });
  if (!m?.licenseId) return false;
  const lic = await db.orgLicense.findUnique({ where: { id: m.licenseId }, select: { periodEnd: true, periodStart: true } });
  return Boolean(lic && lic.periodEnd > now && lic.periodStart <= now);
}

/** El worker: cupos del mes y cuentas que cumplen 18 (pasan a adultas). */
export async function maintainOrgMembers(now = new Date()): Promise<{ quotas: number; adults: number }> {
  const students = await db.orgMember.findMany({ where: { status: "ACTIVE", role: "STUDENT", licenseId: { not: null } }, select: { id: true } });
  for (const s of students) await grantLicenseQuotas(s.id, now);
  const minors = await db.orgMember.findMany({ where: { isMinor: true, birthDate: { not: null } }, select: { id: true, birthDate: true } });
  let adults = 0;
  for (const m of minors)
    if (ageOn(m.birthDate!, now) >= 18) {
      await db.orgMember.update({ where: { id: m.id }, data: { isMinor: false } });
      adults++;
    }
  return { quotas: students.length, adults };
}
