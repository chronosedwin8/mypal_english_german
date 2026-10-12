"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/dal";
import { CONFIG_SCHEMA, setConfig, type ConfigKey } from "@/server/config";
import { db } from "@/server/db";
import { grantSeconds, withTx } from "@/server/ledger/wallet";
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
