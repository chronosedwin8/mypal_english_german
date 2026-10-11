// Compartido por Next y por el worker (por eso no importa "server-only").
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Cliente Prisma unico por proceso (en desarrollo, Next recarga modulos: se
 * guarda en globalThis para no abrir un pool nuevo en cada recarga).
 */
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_URL");
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForDb = globalThis as unknown as { __mypalDb?: ReturnType<typeof createClient> };

export const db = globalForDb.__mypalDb ?? createClient();

if (process.env.NODE_ENV !== "production") globalForDb.__mypalDb = db;

export type Db = typeof db;
