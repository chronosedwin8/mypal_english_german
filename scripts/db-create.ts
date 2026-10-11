/**
 * Crea las bases de datos `mypal` y `mypal_test` si no existen.
 * `psql` no esta en el PATH de Windows, por eso se hace con el driver `pg`.
 */
import "dotenv/config";
import { Client } from "pg";

async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const dbName = target.pathname.replace(/^\//, "");
  if (!/^[a-z0-9_]+$/.test(dbName)) {
    throw new Error(`Nombre de base de datos no permitido: ${dbName}`);
  }
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (exists.rowCount) {
      console.log(`✔ La base "${dbName}" ya existe`);
    } else {
      await client.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8'`);
      console.log(`✔ Base "${dbName}" creada`);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  const urls = [process.env.DATABASE_URL, process.env.DATABASE_URL_TEST].filter(
    (u): u is string => Boolean(u),
  );
  if (!urls.length) throw new Error("Falta DATABASE_URL en .env");
  for (const url of urls) await ensureDatabase(url);
}

main().catch((err) => {
  console.error("✖", err instanceof Error ? err.message : err);
  process.exit(1);
});
