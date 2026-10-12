/**
 * Verifica que todos los planes y recargas cumplan el margen minimo (60 %)
 * en el peor caso. Falla (exit 1) si alguno no lo cumple.
 *   pnpm check:pricing
 */
import { EXAM_PRODUCTS, PLANS, TOPUPS, formatUsd } from "@/lib/pricing/catalog";
import { DEFAULT_COSTS, EXAM_UNIT_COSTS_CENTS, examProductMargin, maxMinutesForPrice, worstCaseMargin } from "@/lib/pricing/margin";

let failed = false;
console.log(`Costo Tavus $${DEFAULT_COSTS.tavusCostPerMinUsd}/min + ${DEFAULT_COSTS.leakageBuffer * 100}% · comisión ${DEFAULT_COSTS.feePct * 100}% + $0,30\n`);
const rows = [
  ...PLANS.map((p) => ({ name: `Plan ${p.nameEs}`, price: p.priceUsdCents, seconds: p.monthlySeconds, recurring: true })),
  ...TOPUPS.map((t) => ({ name: t.nameEs, price: t.priceUsdCents, seconds: t.seconds, recurring: false })),
];
for (const r of rows) {
  const m = worstCaseMargin({ priceUsdCents: r.price, seconds: r.seconds, recurring: r.recurring });
  const ok = m.meetsTarget ? "✔" : "✖";
  if (!m.meetsTarget) failed = true;
  console.log(
    `${ok} ${r.name.padEnd(18)} ${formatUsd(r.price).padStart(6)}  ${String(r.seconds / 60).padStart(4)} min  margen ${(m.margin * 100).toFixed(1)} %  (máx. ${maxMinutesForPrice(r.price, r.recurring)} min a este precio)`,
  );
}
console.log(`
Exámenes (simulacro $${EXAM_UNIT_COSTS_CENTS.MOCK / 100}, Writing $${EXAM_UNIT_COSTS_CENTS.WRITING / 100}, Speaking $${EXAM_UNIT_COSTS_CENTS.SPEAKING / 100} por unidad)`);
for (const p of EXAM_PRODUCTS) {
  const m = examProductMargin({ priceUsdCents: p.priceUsdCents, quotas: p.examQuotas!, addon: p.kind === "EXAM_ADDON" });
  if (!m.meetsTarget) failed = true;
  console.log(
    `${m.meetsTarget ? "✔" : "✖"} ${p.nameEs.padEnd(18)} ${formatUsd(p.priceUsdCents).padStart(6)}  ${p.examQuotas!.MOCK} simulacros · ${p.examQuotas!.WRITING} Writing · ${p.examQuotas!.SPEAKING} Speaking  margen ${(m.margin * 100).toFixed(1)} %`,
  );
}
if (failed) {
  console.error("\n✖ Hay productos por debajo del 60 % de margen.");
  process.exit(1);
}
console.log("\n✔ Todos los productos cumplen el margen mínimo.");
