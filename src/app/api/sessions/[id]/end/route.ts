import { z } from "zod";

import { getUserFromRequest } from "@/server/auth/dal";
import { db } from "@/server/db";
import { HttpError, errorResponse, json } from "@/server/http";
import { requestEnd, verifySessionSignature } from "@/server/sessions/lifecycle";

const Body = z.object({
  reason: z.enum(["USER_END", "TAB_CLOSE", "CLIENT_LEFT"]).default("USER_END"),
  endToken: z.string().max(64).optional(),
});

/** Terminar la clase. Acepta la sesion del usuario o el token firmado (sendBeacon al cerrar la pestaña). */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/end">) {
  try {
    const { id } = await ctx.params;
    const raw = await request.text();
    const body = Body.parse(raw ? JSON.parse(raw) : {});
    const user = await getUserFromRequest(request);
    let allowed = false;
    if (user) allowed = Boolean(await db.tutorSession.findFirst({ where: { id, userId: user.id }, select: { id: true } }));
    if (!allowed && body.endToken) allowed = verifySessionSignature(id, "end", body.endToken);
    if (!allowed) throw new HttpError(403, "FORBIDDEN", "No puedes terminar esta clase.");
    await requestEnd(id, body.reason);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
