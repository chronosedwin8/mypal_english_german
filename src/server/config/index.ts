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

  /** Niños: clases mas cortas (atencion) */
  "kids.maxSessionSeconds": z.number().int().min(120).max(1800).default(10 * 60),

  /** IA (Gemini). Los modelos por defecto vienen de .env; aqui se pueden cambiar sin desplegar. */
  "ai.model.generate": z.string().default(process.env.GEMINI_MODEL_PRO ?? ""),
  "ai.model.grade": z.string().default(process.env.GEMINI_MODEL_PRO ?? ""),
  "ai.model.solve": z.string().default(process.env.GEMINI_MODEL_FLASH ?? ""),
  "ai.model.judge": z.string().default(process.env.GEMINI_MODEL_FLASH ?? ""),
  "ai.model.examiner": z.string().default(process.env.GEMINI_MODEL_FLASH ?? ""),
  /** Precio por millon de tokens (USD) por modelo; el razonamiento se cobra como salida. */
  "ai.pricing": z
    .record(z.string(), z.object({ inUsdPerM: z.number().min(0), outUsdPerM: z.number().min(0) }))
    .default({
      "gemini-3.1-pro-preview": { inUsdPerM: 2, outUsdPerM: 12 },
      "gemini-3.8-flash": { inUsdPerM: 0.75, outUsdPerM: 3.75 },
    }),
  /** Tope de gasto diario en IA + voz para examenes (USD). Al alcanzarlo, se pausa. */
  "ai.dailyBudgetUsd": z.number().min(0).default(10),
  /** Costo de voz ElevenLabs por 1.000 caracteres (USD) y de Scribe por hora. */
  "voice.ttsUsdPer1kChars": z.number().min(0).default(0.08),
  "voice.sttUsdPerHour": z.number().min(0).default(0.22),
  /** Tope mensual de caracteres de voz para el banco (la cuenta de ElevenLabs es compartida). */
  "voice.monthlyCharBudget": z.number().int().min(0).default(300_000),

  /** Examenes */
  "exam.enabled": z.boolean().default(true),
  "exam.enabledExams": z
    .array(z.enum(["IELTS_ACADEMIC", "GOETHE_B1", "GOETHE_B2", "GOETHE_C1", "TESTDAF"]))
    .default(["IELTS_ACADEMIC", "GOETHE_B1", "GOETHE_B2", "GOETHE_C1", "TESTDAF"]),
  /** Bloques aprobados minimos por examen/seccion/parte; el worker repone si baja. */
  "exam.bank.minPerPart": z.number().int().min(0).max(200).default(3),
  /** El worker genera banco automaticamente (gasta IA). Apagado = solo con script o admin. */
  "exam.bank.autoGenerate": z.boolean().default(false),
  /** Fraccion de bloques aprobados que pasan a revision humana. */
  "exam.bank.humanReviewSample": z.number().min(0).max(1).default(0.2),
  "exam.bank.judgeMinScore": z.number().min(0).max(10).default(7),
  /** Bloques con claridad (segun el juez) menor a esto van siempre a revision humana. */
  "exam.bank.reviewBelowClarity": z.number().min(0).max(10).default(8),
  /** Bandas objetivo del banco IELTS; el generador equilibra el inventario entre ellas. */
  "exam.bank.targetBands": z.array(z.number().min(4).max(9)).min(1).default([5.5, 6.5, 7.5]),
  /** Fraccion de preguntas que el resolutor a ciegas debe acertar (1 = todas). */
  "exam.bank.solverMinAgreement": z.number().min(0.5).max(1).default(1),
  /** Fraccion minima del guion que Scribe debe reconocer en el audio generado. */
  "exam.bank.audioMinMatch": z.number().min(0).max(1).default(0.85),
  /** Caracteres por solicitud a ElevenLabs Text to Dialogue (limite ~2.000). */
  "exam.audio.maxCharsPerRequest": z.number().int().min(300).max(2000).default(1800),
  /** Practicas autocalificadas gratis para quien no tiene plan ni cupo de examen. */
  "exam.freePractices": z.number().int().min(0).max(50).default(1),
  /** Generacion al momento en practica dirigida (por usuario y dia). */
  "exam.adhoc.dailyPerUser": z.number().int().min(0).max(50).default(3),
  "exam.writing.task2Weight": z.number().min(1).max(4).default(2),
  /** Cortes ESTIMADOS de TestDaF (escala 0–20 → TDN). */
  "exam.testdaf.cutoffs": z
    .object({ tdn5: z.number(), tdn4: z.number(), tdn3: z.number() })
    .default({ tdn5: 16, tdn4: 12, tdn3: 8 }),
  /** Segundos para leer las preguntas antes de cada tramo de audio de Listening. */
  "exam.listening.readSeconds": z.number().int().min(0).max(120).default(30),
  /** Speaking: preguntas de la Parte 1 y de la Parte 3, y segundos maximos por respuesta. */
  "exam.speaking.part1Questions": z.number().int().min(3).max(14).default(9),
  "exam.speaking.part3Questions": z.number().int().min(2).max(10).default(6),
  "exam.speaking.answerSeconds": z.number().int().min(15).max(180).default(60),
  "exam.speaking.longTurnSeconds": z.number().int().min(60).max(180).default(120),
  /** Preparacion maxima en practica (el Goethe real da 15–20 min antes de la prueba oral). */
  "exam.speaking.maxPrepSeconds": z.number().int().min(30).max(1200).default(180),
  /** Validez de las URLs prefirmadas de audio (segundos). */
  "exam.audioUrlSeconds": z.number().int().min(30).max(3600).default(300),

  /** Plan de estudios: horas de estudio para subir una banda IELTS (supuesto) y semanas sin fecha. */
  "study.hoursPerBand": z.number().min(20).max(500).default(150),
  "study.defaultWeeks": z.number().int().min(2).max(26).default(8),

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
