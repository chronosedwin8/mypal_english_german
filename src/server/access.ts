/**
 * Control de accesos. Hoy: administrador (todo, sin muro de pago), interruptores
 * globales de configuracion y cupos del plan. Las reglas por institucion, grupo y
 * excepciones por usuario se agregan en la fase de Instituciones (AccessRule).
 */
import type { Resource } from "@/lib/access/resources";
import type { CurrentUser } from "@/server/auth/dal";
import { getConfig } from "@/server/config";
import { quotaSummary } from "@/server/exams/entitlements";

export interface AccessDecision {
  allowed: boolean;
  /** el usuario es administrador: uso sin cupo (costo interno) */
  unlimited: boolean;
  reason?: string;
}

export async function can(user: Pick<CurrentUser, "id" | "role">, resource: Resource): Promise<AccessDecision> {
  const config = await getConfig();
  const admin = user.role === "ADMIN";

  if (resource.startsWith("exam.") && !config["exam.enabled"]) {
    return { allowed: admin, unlimited: admin, reason: "Los exámenes están en pausa." };
  }
  if (admin) return { allowed: true, unlimited: true };

  switch (resource) {
    case "exam.practice":
      // Practica autocalificada: costo casi cero, para todos los usuarios con cuenta.
      return { allowed: true, unlimited: false };
    case "exam.writing":
    case "exam.speaking":
    case "exam.mock": {
      const q = await quotaSummary(user.id);
      const kind = resource === "exam.writing" ? "WRITING" : resource === "exam.speaking" ? "SPEAKING" : "MOCK";
      return q[kind].available > 0
        ? { allowed: true, unlimited: false }
        : { allowed: false, unlimited: false, reason: "Necesitas el Pase de examen o un Plan Examen para esta función." };
    }
    case "exam.adhoc":
      return { allowed: config["exam.adhoc.dailyPerUser"] > 0, unlimited: false };
    default:
      return { allowed: true, unlimited: false };
  }
}
