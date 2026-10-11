/**
 * Verifica que todos los planes y recargas cumplan el margen minimo (60 %)
 * en el peor caso. Falla (exit 1) si alguno no lo cumple.
 *   pnpm check:pricing
 */
import { PLANS, TOPUPS, formatUsd } from "@/lib/pricing/catalog";
import { DEFAULT_COSTS, maxMinutesForPrice, worstCaseMargin } from "@/lib/pricing/margin";

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
if (failed) {
  console.error("\n✖ Hay productos por debajo del 60 % de margen.");
  process.exit(1);
}
console.log("\n✔ Todos los productos cumplen el margen mínimo.");
