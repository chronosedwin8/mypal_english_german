/**
 * Datos base (idempotente: se puede correr cuantas veces se quiera).
 *   pnpm db:seed
 */
import "dotenv/config";

import { DE_ITEMS } from "@/content/diagnostic/de";
import { EN_ITEMS } from "@/content/diagnostic/en";
import { LEVEL_DIFFICULTY, type ItemDef } from "@/content/diagnostic/types";
import { PLANS, TOPUPS } from "@/lib/pricing/catalog";
import { worstCaseMargin } from "@/lib/pricing/margin";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";

import { seedModules } from "./modules";

async function seedPlans() {
  for (const p of PLANS) {
    const m = worstCaseMargin({ priceUsdCents: p.priceUsdCents, seconds: p.monthlySeconds, recurring: true });
    if (!m.meetsTarget) throw new Error(`El plan ${p.id} no cumple el margen minimo (${(m.margin * 100).toFixed(1)} %)`);
    const data = {
      nameEs: p.nameEs,
      priceUsdCents: p.priceUsdCents,
      monthlySeconds: p.monthlySeconds,
      perSessionCapSeconds: p.perSessionCapSeconds,
      highlight: p.highlight,
      sortOrder: p.sortOrder,
      features: p.features,
      isActive: true,
    };
    await db.plan.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }
  for (const t of TOPUPS) {
    const m = worstCaseMargin({ priceUsdCents: t.priceUsdCents, seconds: t.seconds, recurring: false });
    if (!m.meetsTarget) throw new Error(`La recarga ${t.id} no cumple el margen minimo`);
    const data = {
      nameEs: t.nameEs,
      priceUsdCents: t.priceUsdCents,
      seconds: t.seconds,
      validityDays: t.validityDays,
      sortOrder: t.sortOrder,
      isActive: true,
    };
    await db.topupPack.upsert({ where: { id: t.id }, create: { id: t.id, ...data }, update: data });
  }
  console.log(`✔ ${PLANS.length} planes y ${TOPUPS.length} recargas`);
}

async function seedDiagnostic() {
  const all: [ItemDef[], "EN" | "DE"][] = [
    [EN_ITEMS, "EN"],
    [DE_ITEMS, "DE"],
  ];
  let n = 0;
  for (const [items, lang] of all) {
    for (const [i, it] of items.entries()) {
      // Dificultad del nivel con una pequeña variacion para ordenar dentro del nivel.
      const difficulty = LEVEL_DIFFICULTY[it.level] + ((i % 5) - 2) * 0.12;
      const data = {
        lang,
        skill: it.skill,
        level: it.level,
        difficulty,
        stem: it.stem,
        passage: it.passage ?? null,
        audioText: it.audioText ?? null,
        options: it.options,
        correctIndex: 0,
        explanationEs: it.explanationEs ?? null,
        isActive: true,
      };
      await db.diagnosticItem.upsert({ where: { id: it.id }, create: { id: it.id, ...data }, update: data });
      n++;
    }
  }
  console.log(`✔ ${n} preguntas del test de nivel`);
}

async function seedSlots() {
  const config = await getConfig({ fresh: true });
  const limit = config["concurrency.limit"];
  for (let id = 1; id <= Math.max(limit, 1); id++) {
    await db.concurrencySlot.upsert({ where: { id }, create: { id, state: "FREE" }, update: {} });
  }
  // Cupos por encima del limite quedan deshabilitados (si estaban libres).
  await db.concurrencySlot.updateMany({ where: { id: { gt: limit }, state: "FREE" }, data: { state: "DISABLED" } });
  await db.concurrencySlot.updateMany({ where: { id: { lte: limit }, state: "DISABLED" }, data: { state: "FREE" } });
  console.log(`✔ ${limit} cupos de clases simultaneas`);
}

async function main() {
  await seedPlans();
  await seedDiagnostic();
  await seedSlots();
  await seedModules();
}

main()
  .catch((err) => {
    console.error("✖ Error en el seed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
