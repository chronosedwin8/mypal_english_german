import { execSync } from "node:child_process";

import "dotenv/config";

/** Aplica las migraciones a la base de pruebas (mypal_test) una vez por corrida. */
export default function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url || !url.includes("mypal_test")) {
    throw new Error("DATABASE_URL_TEST debe apuntar a la base mypal_test");
  }
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });
}
