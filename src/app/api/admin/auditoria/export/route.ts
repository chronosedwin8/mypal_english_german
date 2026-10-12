import { auditCsv, auditQuery } from "@/server/admin/audit";
import { getUserFromRequest, require2fa } from "@/server/auth/dal";
import { db } from "@/server/db";

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPPORT")) return new Response("No autorizado", { status: 403 });
  if (require2fa() && !user.twoFactorEnabled) return new Response("Activa la verificación en dos pasos", { status: 403 });
  const sp = new URL(request.url).searchParams;
  const filters = { action: sp.get("accion") ?? "", entity: sp.get("entidad") ?? "", actor: sp.get("autor") ?? "" };
  const rows = await auditQuery(filters, 10_000);
  await db.auditLog.create({ data: { actorUserId: user.id, action: "audit.export", entity: "AuditLog", after: { ...filters, rows: rows.length } } });
  return new Response("﻿" + auditCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="auditoria-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
