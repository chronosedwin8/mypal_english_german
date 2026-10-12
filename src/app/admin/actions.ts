"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/dal";
import { CONFIG_SCHEMA, setConfig, type ConfigKey } from "@/server/config";
import { db } from "@/server/db";
import { grantSeconds, withTx } from "@/server/ledger/wallet";
import { grantQuota } from "@/server/exams/entitlements";
import { requestEnd, syncSlots } from "@/server/sessions/lifecycle";

export async function forceEnd(formData: FormData) {
  const admin = await requireAdmin();
  const id = z.string().min(1).parse(formData.get("sessionId"));
  await requestEnd(id, "ADMIN");
  await db.auditLog.create({ data: { actorUserId: admin.id, action: "session.force_end", entity: "TutorSession", entityId: id } });
  revalidatePath("/admin/en-vivo");
}

export async function grantMinutes(formData: FormData) {
  const admin = await requireAdmin();
  const input = z
    .object({
      userId: z.string().min(1),
      minutes: z.coerce.number().int().min(1).max(600),
      days: z.coerce.number().int().min(1).max(365),
      reason: z.string().trim().min(3).max(200),
    })
    .parse(Object.fromEntries(formData));
  const audit = await db.auditLog.create({
    data: { actorUserId: admin.id, action: "minutes.grant", entity: "User", entityId: input.userId, after: input },
  });
  await withTx((tx) =>
    grantSeconds(tx, {
      userId: input.userId,
      source: "ADMIN_GRANT",
      seconds: input.minutes * 60,
      expiresAt: new Date(Date.now() + input.days * 86_400_000),
      grantKey: `admin:${audit.id}`,
      actorUserId: admin.id,
      reason: input.reason,
    }),
  );
  revalidatePath(`/admin/usuarios/${input.userId}`);
  redirect(`/admin/usuarios/${input.userId}?ok=1`);
}

export async function updateConfig(formData: FormData) {
  const admin = await requireAdmin();
  const key = z.string().parse(formData.get("key")) as ConfigKey;
  const schema = CONFIG_SCHEMA[key];
  if (!schema) throw new Error("Clave desconocida");
  const raw = formData.get("value");
  const def = schema.parse(undefined);
  let value: unknown;
  if (typeof def === "boolean") value = raw === "on" || raw === "true";
  else if (typeof def === "number") value = Number(raw);
  else if (typeof def === "object" && def !== null) {
    // Listas y tablas (p. ej. bandas objetivo, precios de modelos) se editan como JSON.
    try {
      value = JSON.parse(String(raw));
    } catch {
      redirect(`/admin/configuracion?error=${encodeURIComponent(`${key}: el JSON no es válido`)}#${key}`);
    }
  } else value = String(raw);
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    redirect(`/admin/configuracion?error=${encodeURIComponent(`${key}: ${parsed.error.issues[0]?.message ?? "valor no válido"}`)}#${key}`);
  await setConfig(key, value, admin.id);
  if (key === "concurrency.limit") await syncSlots();
  revalidatePath("/admin/configuracion");
  revalidatePath("/admin");
}

/* ───────────── Usuarios: cupos de examen, suspension y rol ───────────── */

export async function grantExamQuotaAction(formData: FormData) {
  const admin = await requireAdmin();
  const input = z
    .object({
      userId: z.string().min(1),
      kind: z.enum(["MOCK", "WRITING", "SPEAKING"]),
      amount: z.coerce.number().int().min(1).max(100),
      days: z.coerce.number().int().min(1).max(365),
      reason: z.string().trim().min(3).max(200),
    })
    .parse(Object.fromEntries(formData));
  const audit = await db.auditLog.create({ data: { actorUserId: admin.id, action: "exam_quota.grant", entity: "User", entityId: input.userId, after: input } });
  await grantQuota({
    userId: input.userId,
    kind: input.kind,
    amount: input.amount,
    periodStart: new Date(),
    periodEnd: new Date(Date.now() + input.days * 86_400_000),
    sourceKey: `admin:${audit.id}`,
  });
  revalidatePath(`/admin/usuarios/${input.userId}`);
  redirect(`/admin/usuarios/${input.userId}?aviso=${encodeURIComponent("Cupo de examen otorgado.")}`);
}

/** Suspende (cierra sus sesiones e impide ingresar) o reactiva una cuenta. */
export async function setSuspendedAction(formData: FormData) {
  const admin = await requireAdmin();
  const input = z.object({ userId: z.string().min(1), suspend: z.enum(["true", "false"]), reason: z.string().trim().max(200).optional() }).parse(Object.fromEntries(formData));
  if (input.userId === admin.id) throw new Error("No puedes suspender tu propia cuenta.");
  const suspend = input.suspend === "true";
  await db.$transaction([
    db.user.update({ where: { id: input.userId }, data: { bannedAt: suspend ? new Date() : null } }),
    ...(suspend ? [db.session.deleteMany({ where: { userId: input.userId } })] : []),
    db.auditLog.create({ data: { actorUserId: admin.id, action: suspend ? "user.suspend" : "user.reactivate", entity: "User", entityId: input.userId, after: input } }),
  ]);
  revalidatePath(`/admin/usuarios/${input.userId}`);
  redirect(`/admin/usuarios/${input.userId}?aviso=${encodeURIComponent(suspend ? "Cuenta suspendida y sesiones cerradas." : "Cuenta reactivada.")}`);
}

export async function setRoleAction(formData: FormData) {
  const admin = await requireAdmin();
  const input = z.object({ userId: z.string().min(1), role: z.enum(["STUDENT", "SUPPORT", "ADMIN"]) }).parse(Object.fromEntries(formData));
  if (input.userId === admin.id && input.role !== "ADMIN") throw new Error("No puedes quitarte el rol de administrador.");
  const before = await db.user.findUniqueOrThrow({ where: { id: input.userId }, select: { role: true } });
  await db.$transaction([
    db.user.update({ where: { id: input.userId }, data: { role: input.role } }),
    // El rol nuevo se toma al volver a ingresar.
    db.session.deleteMany({ where: { userId: input.userId } }),
    db.auditLog.create({ data: { actorUserId: admin.id, action: "user.role", entity: "User", entityId: input.userId, before, after: input } }),
  ]);
  revalidatePath(`/admin/usuarios/${input.userId}`);
  redirect(`/admin/usuarios/${input.userId}?aviso=${encodeURIComponent(`Rol cambiado a ${input.role}.`)}`);
}

/* ───────────── Accesos ───────────── */

export async function createAccessRuleAction(formData: FormData) {
  const admin = await requireAdmin();
  const input = z
    .object({
      scope: z.enum(["GLOBAL", "ORG", "GROUP", "USER"]),
      target: z.string().trim().max(200).optional(),
      resource: z.string().min(3).max(60),
      allowed: z.enum(["true", "false"]),
      reason: z.string().trim().min(3).max(200),
      days: z.coerce.number().int().min(0).max(730).default(0),
    })
    .parse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  let scopeId = "";
  if (input.scope === "USER") {
    const u = await db.user.findUnique({ where: { email: (input.target ?? "").toLowerCase() } });
    if (!u) redirect(`/admin/accesos?aviso=${encodeURIComponent("No existe un usuario con ese correo.")}`);
    scopeId = u.id;
  } else if (input.scope === "ORG") {
    const o = await db.organization.findFirst({ where: { OR: [{ slug: input.target ?? "" }, { id: input.target ?? "" }] } });
    if (!o) redirect(`/admin/accesos?aviso=${encodeURIComponent("No existe esa institución (usa su identificador corto).")}`);
    scopeId = o.id;
  } else if (input.scope === "GROUP") {
    const g = await db.group.findUnique({ where: { id: input.target ?? "" } });
    if (!g) redirect(`/admin/accesos?aviso=${encodeURIComponent("No existe ese grupo.")}`);
    scopeId = g.id;
  }
  const data = {
    allowed: input.allowed === "true",
    reason: input.reason,
    authorId: admin.id,
    expiresAt: input.days ? new Date(Date.now() + input.days * 86_400_000) : null,
  };
  const rule = await db.accessRule.upsert({
    where: { scope_scopeId_resource: { scope: input.scope, scopeId, resource: input.resource } },
    create: { scope: input.scope, scopeId, resource: input.resource, ...data },
    update: data,
  });
  await db.auditLog.create({ data: { actorUserId: admin.id, action: "access.rule", entity: "AccessRule", entityId: rule.id, after: input } });
  revalidatePath("/admin/accesos");
  redirect(`/admin/accesos?aviso=${encodeURIComponent("Regla guardada.")}`);
}

export async function deleteAccessRuleAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = z.string().min(1).parse(formData.get("id"));
  const before = await db.accessRule.findUnique({ where: { id } });
  await db.accessRule.delete({ where: { id } });
  await db.auditLog.create({ data: { actorUserId: admin.id, action: "access.rule_delete", entity: "AccessRule", entityId: id, before: before as never } });
  revalidatePath("/admin/accesos");
}

/* ───────────── Moderacion ───────────── */

export async function resolveFlagAction(formData: FormData) {
  const admin = await requireAdmin();
  const input = z.object({ id: z.string(), action: z.enum(["RESOLVED", "ESCALATED"]), note: z.string().trim().max(500).optional() }).parse(Object.fromEntries(formData));
  const flag = await db.moderationFlag.findUniqueOrThrow({ where: { id: input.id } });
  await db.moderationFlag.update({
    where: { id: input.id },
    data:
      input.action === "RESOLVED"
        ? { status: "RESOLVED", resolvedBy: admin.id, resolvedAt: new Date(), note: input.note ? `${flag.note}\n— ${input.note}` : flag.note }
        : { severity: "HIGH", note: input.note ? `${flag.note}\n— escalada: ${input.note}` : flag.note },
  });
  await db.auditLog.create({ data: { actorUserId: admin.id, action: `moderation.${input.action.toLowerCase()}`, entity: "ModerationFlag", entityId: input.id, after: input } });
  revalidatePath("/admin/moderacion");
}
