import { randomUUID } from "node:crypto";

import { db } from "@/server/db";

/** Vacia todas las tablas de la base de pruebas (no las migraciones). */
export async function resetDatabase() {
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (!rows.length) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function createTestUser(overrides: { email?: string; role?: string } = {}) {
  const id = randomUUID();
  const email = overrides.email ?? `u-${id.slice(0, 8)}@test.local`;
  return db.user.create({
    data: {
      id,
      name: "Estudiante de prueba",
      email,
      emailCanonical: email.toLowerCase(),
      emailVerified: true,
      role: overrides.role ?? "STUDENT",
    },
  });
}

export const inDays = (n: number, from = new Date()) => new Date(from.getTime() + n * 86_400_000);
