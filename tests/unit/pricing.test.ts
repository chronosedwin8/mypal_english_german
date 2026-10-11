import { describe, expect, it } from "vitest";

import { PLANS, TOPUPS, TRIAL_SECONDS } from "@/lib/pricing/catalog";
import {
  DEFAULT_COSTS,
  cheapestTavusTier,
  maxMinutesForPrice,
  minPriceForSeconds,
  worstCaseMargin,
} from "@/lib/pricing/margin";

describe("margen garantizado (peor caso: 100 % de los minutos usados)", () => {
  it.each(PLANS.map((p) => [p.id, p] as const))("plan %s cumple >= 60 %%", (_id, plan) => {
    const m = worstCaseMargin({
      priceUsdCents: plan.priceUsdCents,
      seconds: plan.monthlySeconds,
      recurring: true,
    });
    expect(m.margin).toBeGreaterThanOrEqual(DEFAULT_COSTS.targetMargin);
    expect(m.meetsTarget).toBe(true);
  });

  it.each(TOPUPS.map((t) => [t.id, t] as const))("recarga %s cumple >= 60 %%", (_id, t) => {
    const m = worstCaseMargin({ priceUsdCents: t.priceUsdCents, seconds: t.seconds, recurring: false });
    expect(m.meetsTarget).toBe(true);
  });

  it("coincide con las cifras del plan aprobado", () => {
    const pct = (id: string) => {
      const p = PLANS.find((x) => x.id === id)!;
      return Math.round(
        worstCaseMargin({ priceUsdCents: p.priceUsdCents, seconds: p.monthlySeconds, recurring: true })
          .margin * 1000,
      ) / 10;
    };
    expect(pct("basico")).toBe(61.2);
    expect(pct("fluido")).toBe(60.7);
    expect(pct("inmersion")).toBe(60.5);
  });

  it("la propuesta original ($49 con 100 min) no llega al 60 %", () => {
    const m = worstCaseMargin({ priceUsdCents: 4900, seconds: 100 * 60, recurring: true });
    expect(m.meetsTarget).toBe(false);
    expect(Math.round(m.margin * 100)).toBe(17);
    expect(maxMinutesForPrice(4900, true)).toBe(42);
  });

  it("las recargas cuestan mas por minuto que el plan Fluido", () => {
    const fluido = PLANS.find((p) => p.id === "fluido")!;
    const perMin = (cents: number, s: number) => cents / (s / 60);
    for (const t of TOPUPS) {
      expect(perMin(t.priceUsdCents, t.seconds)).toBeGreaterThan(
        perMin(fluido.priceUsdCents, fluido.monthlySeconds),
      );
    }
  });

  it("precio minimo calculado deja >= 60 %", () => {
    const price = minPriceForSeconds(45 * 60, true);
    expect(worstCaseMargin({ priceUsdCents: price, seconds: 45 * 60, recurring: true }).meetsTarget).toBe(true);
  });

  it("la prueba gratis es de 5 minutos", () => {
    expect(TRIAL_SECONDS).toBe(300);
  });
});

describe("recomendacion de plan Tavus", () => {
  it("Builder hasta ~1.140 min/mes, luego Growth, luego Business", () => {
    expect(cheapestTavusTier(500).id).toBe("builder");
    expect(cheapestTavusTier(1100).id).toBe("builder");
    expect(cheapestTavusTier(1200).id).toBe("growth");
    expect(cheapestTavusTier(3000).id).toBe("growth");
    expect(cheapestTavusTier(3300).id).toBe("business");
  });
});
