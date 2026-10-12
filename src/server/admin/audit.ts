import "server-only";

import { db } from "@/server/db";

export type AuditFilters = { action?: string; entity?: string; actor?: string };

export type AuditRow = {
  id: bigint;
  createdAt: Date;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
};

/** Registro de auditoria con filtros por prefijo de accion, entidad y correo del autor. */
export async function auditQuery(filters: AuditFilters, take: number): Promise<AuditRow[]> {
  let actorIds: string[] | undefined;
  if (filters.actor) {
    const users = await db.user.findMany({ where: { email: { contains: filters.actor.toLowerCase() } }, select: { id: true }, take: 50 });
    actorIds = users.map((u) => u.id);
  }
  const rows = await db.auditLog.findMany({
    where: {
      ...(filters.action ? { action: { startsWith: filters.action } } : {}),
      ...(filters.entity ? { entity: filters.entity } : {}),
      ...(actorIds ? { actorUserId: { in: actorIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });
  const ids = [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))];
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } });
  const email = new Map(users.map((u) => [u.id, u.email]));
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    actorEmail: r.actorUserId ? (email.get(r.actorUserId) ?? r.actorUserId) : null,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    before: r.before,
    after: r.after,
  }));
}

/** CSV con comillas dobles escapadas y proteccion contra formulas en hojas de calculo. */
export function auditCsv(rows: AuditRow[]): string {
  const cell = (v: unknown) => {
    let s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const head = ["id", "fecha", "autor", "accion", "entidad", "entidad_id", "antes", "despues"];
  const lines = rows.map((r) => [r.id.toString(), r.createdAt.toISOString(), r.actorEmail, r.action, r.entity, r.entityId, r.before, r.after].map(cell).join(","));
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}
