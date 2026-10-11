/**
 * Calculo de margen en el PEOR caso: el usuario consume el 100 % de sus minutos.
 *
 *   margen = (precio − comision − minutos × costo/min × (1 + colchon) − plataforma) / precio
 *
 * Funciones puras: las usan el admin (validar precios), el seed y los tests.
 */

export interface CostAssumptions {
  /** Costo de Tavus por minuto en USD (minuto extra del plan Tavus actual). */
  tavusCostPerMinUsd: number;
  /** Colchon por redondeos a 6 s, minimos de 30 s y segundos de conexion. */
  leakageBuffer: number;
  /** Comision porcentual de la pasarela de pagos. */
  feePct: number;
  /** Comision fija por cobro, en centavos. */
  feeFixedUsdCents: number;
  /** Hosting, correo, base de datos: por usuario y mes, en centavos. */
  platformUsdCentsPerMonth: number;
  /** Margen minimo exigido sobre el precio (0.6 = 60 %). */
  targetMargin: number;
}

/** Supuestos del plan aprobado: Tavus Builder ($0,35/min) y pasarela LatAm. */
export const DEFAULT_COSTS: CostAssumptions = {
  tavusCostPerMinUsd: 0.35,
  leakageBuffer: 0.05,
  feePct: 0.06,
  feeFixedUsdCents: 30,
  platformUsdCentsPerMonth: 50,
  targetMargin: 0.6,
};

export interface MarginBreakdown {
  priceUsdCents: number;
  feeUsdCents: number;
  tavusUsdCents: number;
  platformUsdCents: number;
  profitUsdCents: number;
  /** 0..1 */
  margin: number;
  meetsTarget: boolean;
}

/**
 * Costo efectivo por minuto en centavos: costo Tavus + colchon, redondeado
 * HACIA ARRIBA al centavo ($0,35 × 1,05 = $0,3675 → $0,37). Conservador.
 */
export function effectiveCostPerMinCents(costs: CostAssumptions = DEFAULT_COSTS): number {
  return Math.ceil(costs.tavusCostPerMinUsd * 100 * (1 + costs.leakageBuffer) - 1e-9);
}

/** Costo Tavus (con colchon) de N segundos, en centavos. */
export function tavusCostCents(seconds: number, costs: CostAssumptions = DEFAULT_COSTS): number {
  return (seconds / 60) * effectiveCostPerMinCents(costs);
}

export function worstCaseMargin(
  input: { priceUsdCents: number; seconds: number; recurring: boolean },
  costs: CostAssumptions = DEFAULT_COSTS,
): MarginBreakdown {
  const { priceUsdCents, seconds, recurring } = input;
  if (priceUsdCents <= 0) throw new Error("El precio debe ser mayor que 0");
  const feeUsdCents = priceUsdCents * costs.feePct + costs.feeFixedUsdCents;
  const tavusUsdCents = tavusCostCents(seconds, costs);
  // Las recargas no suman costo de plataforma: el usuario ya paga su plan.
  const platformUsdCents = recurring ? costs.platformUsdCentsPerMonth : 0;
  const profitUsdCents = priceUsdCents - feeUsdCents - tavusUsdCents - platformUsdCents;
  const margin = profitUsdCents / priceUsdCents;
  return {
    priceUsdCents,
    feeUsdCents,
    tavusUsdCents,
    platformUsdCents,
    profitUsdCents,
    margin,
    // Tolerancia minima para no fallar por redondeo de punto flotante.
    meetsTarget: margin + 1e-9 >= costs.targetMargin,
  };
}

/** Maximo de minutos que caben en un precio sin bajar del margen objetivo. */
export function maxMinutesForPrice(
  priceUsdCents: number,
  recurring: boolean,
  costs: CostAssumptions = DEFAULT_COSTS,
): number {
  const net =
    priceUsdCents * (1 - costs.feePct - costs.targetMargin) -
    costs.feeFixedUsdCents -
    (recurring ? costs.platformUsdCentsPerMonth : 0);
  return Math.max(0, Math.floor(net / effectiveCostPerMinCents(costs)));
}

/** Precio minimo (centavos, redondeado hacia arriba al dolar) para N segundos. */
export function minPriceForSeconds(
  seconds: number,
  recurring: boolean,
  costs: CostAssumptions = DEFAULT_COSTS,
): number {
  const fixed =
    tavusCostCents(seconds, costs) +
    costs.feeFixedUsdCents +
    (recurring ? costs.platformUsdCentsPerMonth : 0);
  const cents = fixed / (1 - costs.feePct - costs.targetMargin);
  return Math.ceil(cents / 100) * 100;
}

/** Plan de Tavus mas barato para un volumen mensual de minutos (para el admin). */
export interface TavusTier {
  id: "builder" | "growth" | "business";
  nameEs: string;
  monthlyFeeUsdCents: number;
  includedMinutes: number;
  overagePerMinUsd: number;
  concurrency: number;
  maxSessionSeconds: number;
}

export const TAVUS_TIERS: readonly TavusTier[] = [
  {
    id: "builder",
    nameEs: "Builder",
    monthlyFeeUsdCents: 5900,
    includedMinutes: 175,
    overagePerMinUsd: 0.35,
    concurrency: 3,
    maxSessionSeconds: 15 * 60,
  },
  {
    id: "growth",
    nameEs: "Growth",
    monthlyFeeUsdCents: 39700,
    includedMinutes: 1300,
    overagePerMinUsd: 0.31,
    concurrency: 10,
    maxSessionSeconds: 60 * 60,
  },
  {
    id: "business",
    nameEs: "Business",
    monthlyFeeUsdCents: 97500,
    includedMinutes: 4000,
    overagePerMinUsd: 0.26,
    concurrency: 15,
    maxSessionSeconds: 60 * 60,
  },
];

export function tavusMonthlyCostCents(tier: TavusTier, minutes: number): number {
  const extra = Math.max(0, minutes - tier.includedMinutes);
  return tier.monthlyFeeUsdCents + extra * tier.overagePerMinUsd * 100;
}

export function cheapestTavusTier(minutes: number): TavusTier {
  return [...TAVUS_TIERS].sort(
    (a, b) => tavusMonthlyCostCents(a, minutes) - tavusMonthlyCostCents(b, minutes),
  )[0];
}
