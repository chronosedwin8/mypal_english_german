/**
 * Control de accesos. Hoy: administrador (todo, sin muro de pago), interruptores
 * globales de configuracion y cupos del plan. Las reglas por institucion, grupo y
 * excepciones por usuario se agregan en la fase de Instituciones (AccessRule).
 */
import type { Resource } from "@/lib/access/resources";
import type { CurrentUser } from "@/server/auth/dal";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { quotaSummary } from "@/server/exams/entitlements";
import { hasOrgLicense, isMinorUser } from "@/server/org";

export interface AccessDecision {
  allowed: boolean;
  /** el usuario es administrador: uso sin cupo (costo interno) */
  unlimited: boolean;
  reason?: string;
}

/** Plan activo (cualquier plan) o algun cupo de examen vigente. */
export async function hasPaidAccess(userId: string): Promise<boolean> {
  const now = new Date();
  const [sub, quota, license] = await Promise.all([
    db.subscription.findFirst({ where: { userId, status: { in: ["ACTIVE", "PAST_DUE"] }, currentPeriodEnd: { gt: now } }, select: { id: true } }),
    db.examEntitlement.findFirst({ where: { userId, periodStart: { lte: now }, periodEnd: { gt: now } }, select: { id: true } }),
    hasOrgLicense(userId, now),
  ]);
  return Boolean(sub || quota || license);
}

/** Regla de acceso mas especifica que aplica a la persona (usuario, grupo, institucion o global). */
export async function accessRuleFor(userId: string, resource: string) {
  const members = await db.orgMember.findMany({ where: { userId, status: "ACTIVE" }, select: { id: true, orgId: true, studying: { select: { groupId: true } } } });
  const groupIds = members.flatMap((m) => m.studying.map((g) => g.groupId));
  const rules = await db.accessRule.findMany({
    where: {
      resource,
      OR: [
        { scope: "USER", scopeId: userId },
        { scope: "GROUP", scopeId: { in: groupIds } },
        { scope: "ORG", scopeId: { in: members.map((m) => m.orgId) } },
        { scope: "GLOBAL", scopeId: "" },
      ],
    },
  });
  const valid = rules.filter((r) => !r.expiresAt || r.expiresAt > new Date());
  for (const scope of ["USER", "GROUP", "ORG", "GLOBAL"]) {
    const r = valid.find((x) => x.scope === scope);
    if (r) return r;
  }
  return null;
}

export async function can(user: Pick<CurrentUser, "id" | "role">, resource: Resource): Promise<AccessDecision> {
  const config = await getConfig();
  const admin = user.role === "ADMIN";

  if (resource.startsWith("exam.") && !config["exam.enabled"]) {
    return { allowed: admin, unlimited: admin, reason: "Los exámenes están en pausa." };
  }
  if (admin) return { allowed: true, unlimited: true };

  // Reglas explicitas (docente o administrador): usuario > grupo > institucion > global.
  const rule = await accessRuleFor(user.id, resource);
  if (rule && !rule.allowed) return { allowed: false, unlimited: false, reason: rule.reason };

  // Menores (15–17, solo via institucion): la IA en vivo necesita un proveedor que admita
  // menores (MINORS_AI_DRIVER); el tutor con avatar, que la institucion lo active.
  const minor = await isMinorUser(user.id);
  if (minor) {
    if ((resource === "exam.writing" || resource === "exam.speaking" || resource === "exam.mock") && !process.env.MINORS_AI_DRIVER?.trim())
      return { allowed: false, unlimited: false, reason: "La corrección con IA aún no está disponible para cuentas de menores de edad. Tu docente puede revisar tus textos." };
    if (resource === "tutor.avatar" || resource === "tutor.kids") {
      const ok = await db.orgMember.findFirst({ where: { userId: user.id, status: "ACTIVE", isMinor: true, org: { avatarForMinors: true } }, select: { id: true } });
      if (!ok) return { allowed: false, unlimited: false, reason: "Tu institución todavía no activó el tutor con avatar." };
    }
  }

  // Excepcion que permite (con motivo y vencimiento): da acceso al recurso, pero los cupos
  // de Writing, Speaking y simulacros se siguen exigiendo.
  if (rule?.allowed && resource !== "exam.writing" && resource !== "exam.speaking" && resource !== "exam.mock") return { allowed: true, unlimited: false };

  switch (resource) {
    case "exam.practice": {
      // Practica autocalificada: costo casi cero. Ilimitada con cualquier plan o cupo de
      // examen; quien no ha pagado tiene unas practicas gratis (embudo).
      if (await hasPaidAccess(user.id)) return { allowed: true, unlimited: false };
      const used = await db.examAttempt.count({ where: { userId: user.id, mode: { in: ["DRILL", "PART", "SECTION"] } } });
      return used < config["exam.freePractices"]
        ? { allowed: true, unlimited: false }
        : { allowed: false, unlimited: false, reason: "Ya usaste tu práctica gratis. Con cualquier plan la práctica de exámenes es ilimitada." };
    }
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
