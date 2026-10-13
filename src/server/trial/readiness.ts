import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { getBalance } from "@/server/ledger/wallet";

export interface ClassBlocker {
  title: string;
  message: string;
  cta: { href: string; label: string };
}

/**
 * Antes de mostrar la sala: ¿puede la persona empezar una clase? Repite las reglas de
 * `claimTrial` que dependen solo de la cuenta, para avisar con un boton claro en vez de
 * fallar al pulsar "Empezar". El servidor vuelve a validar todo al iniciar.
 */
export async function classBlocker(user: { id: string; emailVerified: boolean }): Promise<ClassBlocker | null> {
  const [balance, claim, config] = await Promise.all([
    getBalance(user.id),
    db.trialClaim.findUnique({ where: { userId: user.id }, select: { id: true } }),
    getConfig(),
  ]);
  if (balance.paidAvailableSeconds >= 60 || balance.trialAvailableSeconds >= 60) return null;
  const paywall = { title: "Elige un plan para hablar con tu tutora", message: "Ya usaste tu clase gratis o no tienes minutos disponibles.", cta: { href: "/app/planes", label: "Ver planes" } };
  if (!config["trial.enabled"] || claim) return paywall;
  if (!user.emailVerified)
    return { title: "Confirma tu correo", message: "Para usar tu clase gratis primero confirma tu correo con el enlace que te enviamos.", cta: { href: "/verifica-tu-correo", label: "Reenviar el correo" } };
  if (config["trial.requireDiagnostic"]) {
    const done = await db.diagnosticAttempt.count({ where: { userId: user.id, status: "COMPLETED" } });
    if (!done)
      return {
        title: "Primero, tu test de nivel gratis",
        message: "Tu clase gratis de 5 minutos se activa al terminar el test de nivel (unos 10 minutos). Así tu tutora sabrá cómo hablarte desde el primer segundo.",
        cta: { href: "/test-de-nivel", label: "Hacer el test de nivel" },
      };
  }
  return null;
}
