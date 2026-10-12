/**
 * Worker de MyPAL: vigilantes de clases, cola, vencimientos, invariantes y trabajos de examenes.
 *   pnpm worker
 * Solo corre un worker a la vez (candado de Postgres); si hay otro, este espera.
 */
import "dotenv/config";

import { Client } from "pg";

import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { planBankGaps } from "@/server/exams/bank/planner";
import { calibrateBank } from "@/server/exams/calibration";
import { syncOpenMocks } from "@/server/exams/mock";
import { closeExpiredPractice } from "@/server/exams/practice";
import { purgeExpiredRecordings } from "@/server/exams/recordings";
import { maintainOrgMembers } from "@/server/org";
import { snapshotGroups } from "@/server/org/teaching";
import { replanAll } from "@/server/study/plan";
import { processJobs } from "@/server/jobs/handlers";
import { recoverStaleJobs } from "@/server/jobs/queue";
import { checkLedgerInvariants } from "@/server/ledger/wallet";
import { runRenewals } from "@/server/payments/renewals";
import { maintainQueue, syncSlots } from "@/server/sessions/lifecycle";
import { expireBuckets, killOrphans, pollActiveSessions, sweepSessions } from "@/server/sessions/sweep";

const LOCK_KEY = 74_221_001; // candado unico del worker

interface Loop {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
  running?: boolean;
  last?: number;
}

const isDev = process.env.NODE_ENV !== "production";

const loops: Loop[] = [
  { name: "sweep", everyMs: 5_000, run: () => sweepSessions() },
  { name: "poll", everyMs: isDev ? 5_000 : 30_000, run: () => pollActiveSessions() },
  { name: "queue", everyMs: 5_000, run: () => maintainQueue() },
  { name: "orphans", everyMs: 60_000, run: () => killOrphans() },
  { name: "expire", everyMs: 10 * 60_000, run: () => expireBuckets() },
  { name: "renewals", everyMs: 10 * 60_000, run: () => runRenewals() },
  { name: "slots", everyMs: 60_000, run: () => syncSlots() },
  /** Examenes: cola de trabajos de IA (banco, calificaciones). */
  { name: "exam-jobs", everyMs: 3_000, run: () => processJobs(2) },
  { name: "exam-expired", everyMs: 15_000, run: () => closeExpiredPractice() },
  { name: "exam-mocks", everyMs: 20_000, run: () => syncOpenMocks() },
  { name: "study-replan", everyMs: 60 * 60_000, run: () => replanAll() },
  /** Instituciones: cupos del mes de cada licencia, cuentas que cumplen 18 y resumen de grupos. */
  { name: "org-members", everyMs: 6 * 60 * 60_000, run: () => maintainOrgMembers() },
  { name: "org-snapshots", everyMs: 12 * 60 * 60_000, run: () => snapshotGroups() },
  { name: "exam-stale-jobs", everyMs: 5 * 60_000, run: () => recoverStaleJobs(20) },
  /** Calibracion con uso real: estadisticas por pregunta, bloques defectuosos a revision y tablas por forma. */
  { name: "exam-calibrate", everyMs: 24 * 60 * 60_000, run: () => calibrateBank() },
  /** Grabaciones de Speaking vencidas segun el plazo de cada institucion. */
  { name: "exam-recordings", everyMs: 24 * 60 * 60_000, run: () => purgeExpiredRecordings() },
  {
    name: "exam-bank",
    everyMs: 15 * 60_000,
    run: async () => {
      const config = await getConfig();
      if (!config["exam.enabled"] || !config["exam.bank.autoGenerate"]) return;
      const n = await planBankGaps();
      if (n) console.log(`[worker] banco: ${n} bloques encolados`);
    },
  },
  {
    name: "invariants",
    everyMs: 6 * 60 * 60_000,
    run: async () => {
      const v = await checkLedgerInvariants();
      if (v.length) console.error(`[worker] ⚠ ${v.length} inconsistencias en el ledger:`, v.slice(0, 5));
      else console.log("[worker] ✔ ledger consistente");
    },
  },
];

async function acquireLock(): Promise<Client> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  for (;;) {
    const r = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (r.rows[0]?.ok) return client;
    console.log("[worker] otro worker esta activo; reintento en 15 s");
    await new Promise((res) => setTimeout(res, 15_000));
  }
}

async function main() {
  const lock = await acquireLock();
  const config = await getConfig({ fresh: true });
  console.log(
    `[worker] activo · Tavus: ${process.env.TAVUS_DRIVER === "http" ? "REAL" : "simulador"} · cupos: ${config["concurrency.limit"]}`,
  );
  await syncSlots();

  const tick = async () => {
    const now = Date.now();
    for (const loop of loops) {
      if (loop.running || (loop.last && now - loop.last < loop.everyMs)) continue;
      loop.running = true;
      loop.last = now;
      loop
        .run()
        .catch((err) => console.error(`[worker] ${loop.name}:`, err instanceof Error ? err.message : err))
        .finally(() => (loop.running = false));
    }
  };
  const timer = setInterval(tick, 1_000);
  await tick();

  const stop = async () => {
    clearInterval(timer);
    console.log("[worker] deteniendo…");
    await lock.end().catch(() => undefined);
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error("[worker] error fatal:", err);
  process.exit(1);
});
