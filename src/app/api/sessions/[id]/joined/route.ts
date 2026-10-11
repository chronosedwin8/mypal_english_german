import { getUserFromRequest } from "@/server/auth/dal";
import { HttpError, errorResponse, json } from "@/server/http";
import { markJoined } from "@/server/sessions/lifecycle";

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/joined">) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Ingresa primero.");
    const { id } = await ctx.params;
    await markJoined(id, user.id);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
