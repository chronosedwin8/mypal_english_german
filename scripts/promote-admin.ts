/**
 * Da rol de administrador a una cuenta ya registrada.
 *   pnpm admin:promote tu-correo@ejemplo.com
 */
import "dotenv/config";

import { db } from "@/server/db";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Uso: pnpm admin:promote correo@ejemplo.com");
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No existe una cuenta con el correo ${email}. Regístrate primero.`);
  await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  await db.auditLog.create({ data: { action: "user.promote_admin", entity: "User", entityId: user.id } });
  console.log(`✔ ${email} ahora es administrador. Cierra sesión y vuelve a ingresar.`);
}

main()
  .catch((e) => {
    console.error("✖", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
