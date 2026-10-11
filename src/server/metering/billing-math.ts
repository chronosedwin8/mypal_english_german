/**
 * Matematica de cobro (pura). Replica como cobra Tavus, siempre hacia arriba:
 *   - redondeo a multiplos de 6 s (Tavus dice "al mas cercano"; nosotros subimos),
 *   - minimo 30 s por conversacion creada,
 * asi lo que cobramos al usuario es siempre >= lo que Tavus nos cobra.
 */

export const TAVUS_ROUNDING_SECONDS = 6;
export const TAVUS_MIN_BILLED_SECONDS = 30;

/** Segundos facturables a partir de una duracion en milisegundos. */
export function billedSecondsFromDuration(durationMs: number, conversationCreated: boolean): number {
  if (!conversationCreated) return 0;
  const ms = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const rounded = Math.ceil(ms / 1000 / TAVUS_ROUNDING_SECONDS) * TAVUS_ROUNDING_SECONDS;
  return Math.max(TAVUS_MIN_BILLED_SECONDS, rounded);
}

export interface ReserveInput {
  /** Segundos disponibles en los cubos elegibles. */
  availableSeconds: number;
  /** Tope por clase del plan del usuario (o de la prueba). */
  perSessionCapSeconds: number;
  /** Tope por conversacion del plan Tavus (Builder: 900). */
  tavusPlanMaxSeconds: number;
  /** Margen de seguridad que se resta para fijar max_call_duration. */
  safetyMarginSeconds: number;
  /** Minimo para que valga la pena iniciar una clase. */
  minStartSeconds: number;
}

export type ReserveResult =
  | { ok: true; reserveSeconds: number; maxCallDurationSeconds: number }
  | { ok: false; reason: "INSUFFICIENT_BALANCE"; availableSeconds: number };

/**
 * reserva = min(saldo, min(tope del plan, tope Tavus) + margen)
 * max_call_duration = reserva − margen de seguridad
 *
 * El margen se SUMA al tope del plan para que el usuario reciba la clase completa
 * (10/15 min) y solo se resta del saldo lo realmente usado. Si el saldo es lo que
 * limita, el usuario pierde como mucho el margen en esa ultima clase, y ese margen
 * se le devuelve al liquidar.
 */
export function computeReserve(input: ReserveInput): ReserveResult {
  const { availableSeconds, perSessionCapSeconds, tavusPlanMaxSeconds, safetyMarginSeconds, minStartSeconds } =
    input;
  const sessionCap = Math.min(perSessionCapSeconds, tavusPlanMaxSeconds);
  const reserveSeconds = Math.min(availableSeconds, sessionCap + safetyMarginSeconds);
  const maxCallDurationSeconds = reserveSeconds - safetyMarginSeconds;
  if (maxCallDurationSeconds < minStartSeconds) {
    return { ok: false, reason: "INSUFFICIENT_BALANCE", availableSeconds };
  }
  return { ok: true, reserveSeconds, maxCallDurationSeconds };
}

/** Costo estimado en micro-USD (enteros) de N segundos facturados. */
export function costMicroUsd(billedSeconds: number, costPerMinMicroUsd: number): bigint {
  return (BigInt(billedSeconds) * BigInt(costPerMinMicroUsd)) / BigInt(60);
}

/** "4:05" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
