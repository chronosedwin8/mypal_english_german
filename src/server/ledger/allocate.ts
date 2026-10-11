/**
 * Que cubos financian una clase y en que orden (puro).
 *
 * Orden de consumo de minutos pagados:
 *   1. minutos del plan (vencen al fin del ciclo y no se acumulan),
 *   2. minutos regalados por el admin,
 *   3. recargas, la que vence antes primero.
 * La prueba gratis vive en su propio cubo y SOLO la usa la clase de prueba.
 */

export type BucketSourceName = "TRIAL" | "PLAN_CYCLE" | "ADMIN_GRANT" | "TOPUP";

export const BUCKET_PRIORITY: Record<BucketSourceName, number> = {
  TRIAL: 0,
  PLAN_CYCLE: 10,
  ADMIN_GRANT: 15,
  TOPUP: 20,
};

export interface BucketView {
  id: string;
  source: BucketSourceName;
  priority: number;
  grantedSeconds: number;
  heldSeconds: number;
  consumedSeconds: number;
  expiredSeconds: number;
  validFrom: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface Allocation {
  bucketId: string;
  seconds: number;
  allocOrder: number;
}

export function availableIn(b: Pick<BucketView, "grantedSeconds" | "heldSeconds" | "consumedSeconds" | "expiredSeconds">): number {
  return b.grantedSeconds - b.heldSeconds - b.consumedSeconds - b.expiredSeconds;
}

export function isUsable(b: BucketView, now: Date): boolean {
  return !b.revokedAt && b.validFrom <= now && b.expiresAt > now && availableIn(b) > 0;
}

/** Cubos elegibles, ya ordenados por prioridad de consumo. */
export function eligibleBuckets(buckets: BucketView[], opts: { isTrial: boolean; now: Date }): BucketView[] {
  return buckets
    .filter((b) => (opts.isTrial ? b.source === "TRIAL" : b.source !== "TRIAL"))
    .filter((b) => isUsable(b, opts.now))
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.expiresAt.getTime() - b.expiresAt.getTime() ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
}

export function totalAvailable(buckets: BucketView[]): number {
  return buckets.reduce((sum, b) => sum + availableIn(b), 0);
}

export class InsufficientBalanceError extends Error {
  constructor(
    readonly needed: number,
    readonly available: number,
  ) {
    super(`Saldo insuficiente: se necesitan ${needed} s y hay ${available} s`);
    this.name = "InsufficientBalanceError";
  }
}

/** Reparto voraz sobre cubos YA ordenados. Lanza si no alcanza. */
export function allocate(ordered: BucketView[], need: number): Allocation[] {
  if (!Number.isInteger(need) || need <= 0) throw new Error(`Cantidad invalida: ${need}`);
  const out: Allocation[] = [];
  let remaining = need;
  for (const b of ordered) {
    if (remaining === 0) break;
    const take = Math.min(availableIn(b), remaining);
    if (take <= 0) continue;
    out.push({ bucketId: b.id, seconds: take, allocOrder: out.length });
    remaining -= take;
  }
  if (remaining > 0) throw new InsufficientBalanceError(need, need - remaining);
  return out;
}

export interface HoldView {
  bucketId: string;
  allocOrder: number;
  heldSeconds: number;
  capturedSeconds: number;
  releasedSeconds: number;
}

export interface SettlementPlan {
  captures: { bucketId: string; seconds: number }[];
  releases: { bucketId: string; seconds: number }[];
  /** Lo cobrado que excede la reserva (deberia ser 0 por diseño). */
  overrunSeconds: number;
}

/**
 * Como repartir el cobro final entre las retenciones de una clase:
 * se cobra en el orden en que se retuvo y se libera el resto.
 */
export function planSettlement(holds: HoldView[], chargeSeconds: number): SettlementPlan {
  const ordered = [...holds].sort((a, b) => a.allocOrder - b.allocOrder);
  const captures: SettlementPlan["captures"] = [];
  const releases: SettlementPlan["releases"] = [];
  let toCapture = Math.max(0, Math.floor(chargeSeconds));
  for (const h of ordered) {
    const open = h.heldSeconds - h.capturedSeconds - h.releasedSeconds;
    if (open <= 0) continue;
    const c = Math.min(open, toCapture);
    if (c > 0) captures.push({ bucketId: h.bucketId, seconds: c });
    toCapture -= c;
    const r = open - c;
    if (r > 0) releases.push({ bucketId: h.bucketId, seconds: r });
  }
  return { captures, releases, overrunSeconds: toCapture };
}
