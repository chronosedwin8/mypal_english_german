/** Registro de uso y costo de IA/voz + control del presupuesto diario. */
import { getConfig } from "@/server/config";
import { db } from "@/server/db";

import { AiError } from "./provider";

export async function recordAiUsage(input: {
  provider: string;
  model: string;
  purpose: string;
  inputTokens?: number;
  outputTokens?: number;
  characters?: number;
  seconds?: number;
  costMicroUsd: bigint;
  userId?: string | null;
  refId?: string | null;
  ok?: boolean;
}) {
  await db.aiUsage.create({
    data: {
      provider: input.provider,
      model: input.model,
      purpose: input.purpose,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      characters: input.characters ?? 0,
      seconds: input.seconds ?? 0,
      costMicroUsd: input.costMicroUsd,
      userId: input.userId ?? null,
      refId: input.refId ?? null,
      ok: input.ok ?? true,
    },
  });
}

export async function spentTodayMicroUsd(): Promise<bigint> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const agg = await db.aiUsage.aggregate({ where: { createdAt: { gte: start } }, _sum: { costMicroUsd: true } });
  return agg._sum.costMicroUsd ?? BigInt(0);
}

/** Lanza si se alcanzo el tope diario configurado. */
export async function assertBudget() {
  const config = await getConfig();
  const limit = BigInt(Math.round(config["ai.dailyBudgetUsd"] * 1_000_000));
  const spent = await spentTodayMicroUsd();
  if (spent >= limit) {
    throw new AiError("BUDGET_EXCEEDED", "Se alcanzó el presupuesto diario de IA. Se reanuda mañana o ajústalo en el admin.");
  }
}

/** Costo de tokens segun la tabla de precios de la configuracion. */
export async function tokenCostMicroUsd(model: string, inputTokens: number, outputTokens: number): Promise<bigint> {
  const pricing = (await getConfig())["ai.pricing"][model];
  if (!pricing) return BigInt(0);
  const usd = (inputTokens / 1e6) * pricing.inUsdPerM + (outputTokens / 1e6) * pricing.outUsdPerM;
  return BigInt(Math.round(usd * 1_000_000));
}

export async function ttsCostMicroUsd(characters: number): Promise<bigint> {
  const per1k = (await getConfig())["voice.ttsUsdPer1kChars"];
  return BigInt(Math.round((characters / 1000) * per1k * 1_000_000));
}

export async function sttCostMicroUsd(seconds: number): Promise<bigint> {
  const perHour = (await getConfig())["voice.sttUsdPerHour"];
  return BigInt(Math.round((seconds / 3600) * perHour * 1_000_000));
}
