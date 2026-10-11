import { getUserFromRequest } from "@/server/auth/dal";
import { HttpError, errorResponse, json } from "@/server/http";
import { sessionView } from "@/server/sessions/view";

export async function GET(request: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Ingresa primero.");
    const { id } = await ctx.params;
    const view = await sessionView(id, user.id);
    if (!view) throw new HttpError(404, "NOT_FOUND", "Clase no encontrada.");
    return json(view);
  } catch (err) {
    return errorResponse(err);
  }
}
