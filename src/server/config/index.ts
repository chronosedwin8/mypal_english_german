/**
 * Configuracion operativa editable desde el admin (tabla AppConfig).
 * Cada clave tiene un esquema Zod y un valor por defecto; lo que no esta en la
 * base de datos usa el defecto. Se cachea 30 s por proceso.
 */
import { z } from "zod";

import { db } from "@/server/db";
import { TRIAL_SECONDS } from "@/lib/pricing/catalog";

export const CONFIG_SCHEMA = {
  /** Prueba gratis con el avatar */
  "trial.enabled": z.boolean().default(true),
  "trial.seconds": z.number().int().min(60).max(900).default(TRIAL_SECONDS),
  "trial.requireDiagnostic": z.boolean().default(true),
  "trial.maxPerIpPrefix30d": z.number().int().min(1).max(100).default(3),
  /** Tope diario global de segundos de prueba (100 min ≈ $37) */
  "trial.dailyBudgetSeconds": z.number().int().min(0).default(100 * 60),

  /** Clases simultaneas permitidas (= concurrencia del plan Tavus) */
  "concurrency.limit": z.number().int().min(1).max(100).default(3),

  /** Plan de Tavus contratado */
  "tavus.tier": z.enum(["builder", "growth", "business"]).default("builder"),
  "tavus.planMaxSessionSeconds": z.number().int().min(60).max(3600).default(900),
  /** Costo por minuto en micro-USD ($0,35 = 350000) */
  "tavus.costPerMinMicroUsd": z.number().int().min(0).default(350_000),
  /** Presupuesto mensual de minutos Tavus (interruptor automatico) */
  "tavus.monthlyBudgetSeconds": z.number().int().min(0).default(3000 * 60),
  "tavus.killSwitch": z.boolean().default(false),

  /** Sesiones */
  "session.safetyMarginSeconds": z.number().int().min(0).max(120).default(20),
  "session.minStartSeconds": z.number().int().min(30).max(600).default(60),
  "session.participantAbsentTimeout": z.number().int().min(15).max(300).default(45),
  "session.participantLeftTimeout": z.number().int().min(5).max(120).default(15),
  "session.heartbeatStaleSeconds": z.number().int().min(20).max(300).default(45),
  "session.wrapUpSecondsBefore": z.number().int().min(10).max(180).default(60),
  "session.trialWrapUpSecondsBefore": z.number().int().min(10).max(120).default(30),

  /** Cola */
  "queue.offerSeconds": z.number().int().min(15).max(300).default(45),

  /** Cobro */
  "billing.chargeNoShow": z.boolean().default(true),

  /** Diagnostico sin registro (antiabuso) */
  "diagnostic.maxAttemptsPerIpPerDay": z.number().int().min(1).max(200).default(10),
  "diagnostic.maxSpeakingSeconds": z.number().int().min(5).max(60).default(20),
  "diagnostic.speakingEnabled": z.boolean().default(true),
} as const;

export type ConfigKey = keyof typeof CONFIG_SCHEMA;
export type AppConfigValues = { [K in ConfigKey]: z.output<(typeof CONFIG_SCHEMA)[K]> };

const CACHE_MS = 30_000;
let cache: { at: number; values: AppConfigValues } | null = null;

export function defaultConfig(): AppConfigValues {
  const out: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) out[key] = schema.parse(undefined);
  return out as AppConfigValues;
}

export async function getConfig(opts: { fresh?: boolean } = {}): Promise<AppConfigValues> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.values;
  const rows = await db.appConfig.findMany();
  const values = defaultConfig() as Record<string, unknown>;
  for (const row of rows) {
    const schema = CONFIG_SCHEMA[row.key as ConfigKey];
    if (!schema) continue;
    const parsed = schema.safeParse(row.value);
    if (parsed.success) values[row.key] = parsed.data;
  }
  cache = { at: Date.now(), values: values as AppConfigValues };
  return cache.values;
}

export function invalidateConfigCache() {
  cache = null;
}

export async function setConfig<K extends ConfigKey>(
  key: K,
  value: unknown,
  actorUserId: string | null,
): Promise<AppConfigValues[K]> {
  const schema = CONFIG_SCHEMA[key];
  if (!schema) throw new Error(`Clave de configuracion desconocida: ${key}`);
  const parsed = schema.parse(value) as AppConfigValues[K];
  await db.$transaction(async (tx) => {
    const before = await tx.appConfig.findUnique({ where: { key } });
    await tx.appConfig.upsert({
      where: { key },
      create: { key, value: parsed as never, updatedBy: actorUserId },
      update: { value: parsed as never, updatedBy: actorUserId },
    });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "config.set",
        entity: "AppConfig",
        entityId: key,
        before: before ? (before.value as never) : undefined,
        after: parsed as never,
      },
    });
  });
  invalidateConfigCache();
  return parsed;
}
