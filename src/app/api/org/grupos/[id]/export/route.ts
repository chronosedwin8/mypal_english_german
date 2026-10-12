import { getUserFromRequest } from "@/server/auth/dal";
import { OrgError } from "@/server/org";
import { groupCsv, requireGroupAccess } from "@/server/org/teaching";

/** Exporta el grupo a CSV (abre en Excel o Google Sheets). */
export async function GET(request: Request, ctx: RouteContext<"/api/org/grupos/[id]/export">) {
  const user = await getUserFromRequest(request);
  if (!user) return new Response("Inicia sesión", { status: 401 });
  const { id } = await ctx.params;
  try {
    const { group } = await requireGroupAccess(user, id);
    const csv = await groupCsv(id);
    const name = group.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase();
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="grupo-${name}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof OrgError) return new Response(err.message, { status: err.code === "NOT_FOUND" ? 404 : 403 });
    throw err;
  }
}
