/**
 * Catalogo de precios de MyPAL: UNICA fuente de verdad.
 *
 * Lo usan la landing (precios visibles), el seed (tablas Plan/TopupPack),
 * el admin (validacion de margen) y los tests (ningun plan < 60 % de margen).
 *
 * Unidades: centavos de USD y segundos enteros.
 */

export type PlanId = "basico" | "fluido" | "inmersion" | ExamProductId;
export type ExamProductId = "pase-examen" | "plan-examen" | "examen-intensivo";
/** TUTOR: minutos con el avatar · EXAM: plan de examenes · EXAM_ADDON: complemento de un plan de tutor */
export type PlanKind = "TUTOR" | "EXAM" | "EXAM_ADDON";

export interface ExamQuotas {
  MOCK: number;
  WRITING: number;
  SPEAKING: number;
}
export type TopupId = "recarga-15" | "recarga-30";

export interface PlanDef {
  id: PlanId;
  nameEs: string;
  taglineEs: string;
  priceUsdCents: number;
  monthlySeconds: number;
  /** Duracion maxima de cada clase con el avatar. */
  perSessionCapSeconds: number;
  highlight: boolean;
  sortOrder: number;
  /** Viñetas cortas para la tarjeta de precios. */
  features: string[];
  /** por defecto TUTOR */
  kind?: PlanKind;
  /** cupos de examen por ciclo (productos de examen) */
  examQuotas?: ExamQuotas;
}

export interface TopupDef {
  id: TopupId;
  nameEs: string;
  priceUsdCents: number;
  seconds: number;
  validityDays: number;
  sortOrder: number;
}

export const PLANS: readonly PlanDef[] = [
  {
    id: "basico",
    nameEs: "Básico",
    taglineEs: "Para empezar a soltarte",
    priceUsdCents: 2500,
    monthlySeconds: 20 * 60,
    perSessionCapSeconds: 10 * 60,
    highlight: false,
    sortOrder: 1,
    features: [
      "20 min con tu tutor IA",
      "Clases de hasta 10 min",
      "Inglés (EE. UU. y Reino Unido) y alemán",
      "Vocabulario y repaso ilimitados",
    ],
  },
  {
    id: "fluido",
    nameEs: "Fluido",
    taglineEs: "El ritmo ideal para avanzar",
    priceUsdCents: 6900,
    monthlySeconds: 60 * 60,
    perSessionCapSeconds: 15 * 60,
    highlight: true,
    sortOrder: 2,
    features: [
      "60 min con tu tutor IA",
      "Clases de hasta 15 min",
      "Módulos por nivel con visión",
      "Resumen y correcciones de cada clase",
    ],
  },
  {
    id: "inmersion",
    nameEs: "Inmersión",
    taglineEs: "Para avanzar rápido",
    priceUsdCents: 13500,
    monthlySeconds: 120 * 60,
    perSessionCapSeconds: 15 * 60,
    highlight: false,
    sortOrder: 3,
    features: [
      "120 min con tu tutor IA",
      "Clases de hasta 15 min",
      "Todo lo del plan Fluido",
      "Ideal para entrevistas y viajes",
    ],
  },
];

/**
 * Productos de examen (IELTS, Goethe, TestDaF). La practica autocalificada, el plan
 * de estudios y el seguimiento son ilimitados; lo que cuesta por uso (simulacros,
 * correcciones de Writing y partes de Speaking) va en cupos mensuales.
 */
export const EXAM_PRODUCTS: readonly PlanDef[] = [
  {
    id: "pase-examen",
    nameEs: "Pase de examen",
    taglineEs: "Complemento para tu plan con tutor",
    priceUsdCents: 1500,
    monthlySeconds: 0,
    perSessionCapSeconds: 0,
    highlight: false,
    sortOrder: 10,
    kind: "EXAM_ADDON",
    examQuotas: { MOCK: 2, WRITING: 6, SPEAKING: 8 },
    features: ["2 simulacros completos", "6 correcciones de Writing", "8 partes de Speaking con examinador", "Requiere un plan con tutor"],
  },
  {
    id: "plan-examen",
    nameEs: "Plan Examen",
    taglineEs: "Prepárate para IELTS o Goethe",
    priceUsdCents: 1900,
    monthlySeconds: 0,
    perSessionCapSeconds: 0,
    highlight: true,
    sortOrder: 11,
    kind: "EXAM",
    examQuotas: { MOCK: 2, WRITING: 8, SPEAKING: 10 },
    features: ["2 simulacros completos", "8 correcciones de Writing", "10 partes de Speaking con examinador", "Práctica y plan de estudios ilimitados"],
  },
  {
    id: "examen-intensivo",
    nameEs: "Examen Intensivo",
    taglineEs: "Para la recta final",
    priceUsdCents: 3500,
    monthlySeconds: 0,
    perSessionCapSeconds: 0,
    highlight: false,
    sortOrder: 12,
    kind: "EXAM",
    examQuotas: { MOCK: 4, WRITING: 16, SPEAKING: 20 },
    features: ["4 simulacros completos", "16 correcciones de Writing", "20 partes de Speaking con examinador", "Práctica y plan de estudios ilimitados"],
  },
];

export const ALL_PLANS: readonly PlanDef[] = [...PLANS, ...EXAM_PRODUCTS];

export function planKind(plan: Pick<PlanDef, "kind">): PlanKind {
  return plan.kind ?? "TUTOR";
}

/** Grupo de suscripcion: un plan de tutor y uno de examen pueden convivir. */
export function subscriptionKind(plan: Pick<PlanDef, "kind">): "TUTOR" | "EXAM" {
  return planKind(plan) === "TUTOR" ? "TUTOR" : "EXAM";
}

export const TOPUPS: readonly TopupDef[] = [
  {
    id: "recarga-15",
    nameEs: "Recarga 15 min",
    priceUsdCents: 1900,
    seconds: 15 * 60,
    validityDays: 90,
    sortOrder: 1,
  },
  {
    id: "recarga-30",
    nameEs: "Recarga 30 min",
    priceUsdCents: 3600,
    seconds: 30 * 60,
    validityDays: 90,
    sortOrder: 2,
  },
];

/** Prueba gratuita con el avatar (una sola vez). */
export const TRIAL_SECONDS = 5 * 60;

export function planById(id: string): PlanDef | undefined {
  return ALL_PLANS.find((p) => p.id === id);
}

export function topupById(id: string): TopupDef | undefined {
  return TOPUPS.find((t) => t.id === id);
}

export function formatUsd(cents: number): string {
  const value = cents / 100;
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

/** "20 min", "1 h 30 min" */
export function formatMinutes(seconds: number): string {
  const totalMin = Math.floor(seconds / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
