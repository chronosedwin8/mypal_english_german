import { getUserFromRequest } from "@/server/auth/dal";
import { db } from "@/server/db";
import { HttpError, errorResponse, json } from "@/server/http";
import { queuePosition } from "@/server/sessions/lifecycle";

/** Mi lugar en la fila. Consultarlo tambien dice "sigo aqui" (renueva lastSeenAt). */
export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Ingresa primero.");
    const id = new URL(request.url).searchParams.get("entry");
    if (!id) throw new HttpError(400, "INVALID_INPUT", "Falta la entrada de la fila.");
    const entry = await db.sessionQueueEntry.findFirst({ where: { id, userId: user.id } });
    if (!entry) throw new HttpError(404, "NOT_FOUND", "No estás en la fila.");
    if (entry.status === "WAITING" || entry.status === "OFFERED") {
      await db.sessionQueueEntry.update({ where: { id }, data: { lastSeenAt: new Date() } });
    }
    return json({ status: entry.status, position: await queuePosition(id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Ingresa primero.");
    const id = new URL(request.url).searchParams.get("entry");
    if (id) {
      await db.sessionQueueEntry.updateMany({
        where: { id, userId: user.id, status: { in: ["WAITING", "OFFERED"] } },
        data: { status: "CANCELLED" },
      });
    }
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
