/**
 * Prueba gratis de 5 minutos con el avatar: una sola vez por cuenta, correo
 * normalizado y dispositivo; pocas por red IP; con tope diario global.
 * Se ejecuta DENTRO de la transaccion de inicio (con la billetera bloqueada).
 */
import { canonicalEmail, emailDomain } from "@/lib/email-canonical";
import type { AppConfigValues } from "@/server/config";
import { grantSeconds, type Tx } from "@/server/ledger/wallet";
import { pepperedHash } from "@/server/security";
import { SessionError } from "@/server/sessions/errors";

import { isDisposableDomain } from "./disposable";

export interface TrialRequest {
  userId: string;
  email: string;
  emailVerified: boolean;
  deviceId: string | null;
  ipPrefixHash: string | null;
}

/** Segundos del cubo de prueba: la clase dura trial.seconds completos (+ margen de seguridad). */
export function trialBucketSeconds(config: AppConfigValues) {
  return config["trial.seconds"] + config["session.safetyMarginSeconds"];
}

export async function claimTrial(tx: Tx, req: TrialRequest, config: AppConfigValues, now: Date) {
  if (!config["trial.enabled"]) throw new SessionError("PAYWALL", "Elige un plan para hablar con tu tutor.");
  if (!req.emailVerified) throw new SessionError("TRIAL_NEEDS_VERIFIED_EMAIL", "Confirma tu correo para usar tu clase gratis.");

  const existing = await tx.trialClaim.findUnique({ where: { userId: req.userId } });
  if (existing) throw new SessionError("PAYWALL", "Ya usaste tu clase gratis. Elige un plan para seguir practicando.");

  if (isDisposableDomain(emailDomain(req.email))) {
    throw new SessionError("TRIAL_USED", "La clase gratis no está disponible para correos temporales.");
  }

  if (config["trial.requireDiagnostic"]) {
    const done = await tx.diagnosticAttempt.count({ where: { userId: req.userId, status: "COMPLETED" } });
    if (!done) throw new SessionError("TRIAL_NEEDS_DIAGNOSTIC", "Primero haz el test de nivel gratis: así tu tutor sabrá cómo hablarte.");
  }

  const canonical = canonicalEmail(req.email);
  const deviceIdHash = pepperedHash(`device:${req.deviceId ?? `user:${req.userId}`}`);
  const dup = await tx.trialClaim.findFirst({
    where: { OR: [{ emailCanonical: canonical }, { deviceIdHash }] },
    select: { id: true },
  });
  if (dup) throw new SessionError("TRIAL_USED", "Ya se usó una clase gratis desde este correo o dispositivo.");

  if (req.ipPrefixHash) {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const fromNetwork = await tx.trialClaim.count({ where: { ipPrefixHash: req.ipPrefixHash, createdAt: { gte: since } } });
    if (fromNetwork >= config["trial.maxPerIpPrefix30d"]) {
      throw new SessionError("TRIAL_USED", "Se alcanzó el límite de clases gratis desde tu red.");
    }
  }

  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const today = await tx.trialClaim.count({ where: { createdAt: { gte: dayStart } } });
  if ((today + 1) * config["trial.seconds"] > config["trial.dailyBudgetSeconds"]) {
    throw new SessionError("TRIAL_LIMIT_REACHED", "Hoy se agotaron las clases gratis. Vuelve mañana o elige un plan.");
  }

  await tx.trialClaim.create({
    data: {
      userId: req.userId,
      emailCanonical: canonical,
      deviceIdHash,
      ipPrefixHash: req.ipPrefixHash ?? "desconocida",
    },
  });
  await grantSeconds(tx, {
    userId: req.userId,
    source: "TRIAL",
    seconds: trialBucketSeconds(config),
    validFrom: now,
    expiresAt: new Date(now.getTime() + 7 * 86_400_000),
    grantKey: `trial:${req.userId}`,
    reason: "clase gratis",
  });
}
