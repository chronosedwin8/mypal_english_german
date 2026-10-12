/**
 * Crea (o promueve) una cuenta de administrador con correo verificado.
 * La contrasena se lee de la variable ADMIN_PASSWORD: nunca queda en archivos.
 *
 *   ADMIN_PASSWORD='...' pnpm admin:create correo@ejemplo.com "Nombre"
 */
import "dotenv/config";

import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { canonicalEmail } from "@/lib/email-canonical";
import { db } from "@/server/db";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const name = process.argv[3]?.trim() || "Administrador";
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !email.includes("@")) throw new Error('Uso: ADMIN_PASSWORD="..." pnpm admin:create correo@ejemplo.com "Nombre"');
  if (password.length < 8) throw new Error("ADMIN_PASSWORD debe tener al menos 8 caracteres.");

  const hash = await hashPassword(password);
  const existing = await db.user.findUnique({ where: { email } });
  const userId = existing?.id ?? randomUUID();
  await db.$transaction(async (tx) => {
    if (existing) {
      await tx.user.update({ where: { id: userId }, data: { role: "ADMIN", emailVerified: true } });
    } else {
      await tx.user.create({ data: { id: userId, name, email, emailCanonical: canonicalEmail(email), emailVerified: true, role: "ADMIN" } });
    }
    const credential = await tx.account.findFirst({ where: { userId, providerId: "credential" } });
    if (credential) await tx.account.update({ where: { id: credential.id }, data: { password: hash } });
    else await tx.account.create({ data: { id: randomUUID(), accountId: userId, providerId: "credential", userId, password: hash } });
    await tx.minuteWallet.upsert({ where: { userId }, create: { userId }, update: {} });
    await tx.auditLog.create({ data: { action: existing ? "user.promote_admin" : "user.create_admin", entity: "User", entityId: userId } });
  });
  console.log(`✔ ${email} es administrador (${existing ? "cuenta existente promovida" : "cuenta nueva"}). Ya puede ingresar en /ingresar.`);
}

main()
  .catch((e) => {
    console.error("✖", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
