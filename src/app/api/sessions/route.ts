import { z } from "zod";

import { getUserFromRequest } from "@/server/auth/dal";
import { HttpError, errorResponse, json } from "@/server/http";
import { DEVICE_COOKIE, clientIp, ipPrefixHash, readCookie, verifyTurnstile } from "@/server/security";
import { SessionError } from "@/server/sessions/errors";
import { startSession } from "@/server/sessions/lifecycle";
import { sessionView } from "@/server/sessions/view";

import { toHttp } from "./_shared";

const Body = z.object({
  language: z.enum(["EN_US", "EN_GB", "DE"]),
  audience: z.enum(["ADULT", "KIDS"]).default("ADULT"),
  lessonId: z.string().max(120).nullish(),
  queueEntryId: z.string().uuid().nullish(),
  turnstileToken: z.string().max(4096).nullish(),
  deviceId: z.string().max(100).nullish(),
});

/** Empezar una clase (o entrar a la fila si todos los cupos estan ocupados). */
export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Ingresa para empezar tu clase.");
    const idem = request.headers.get("idempotency-key");
    if (!idem || idem.length > 100) throw new HttpError(400, "INVALID_INPUT", "Falta Idempotency-Key.");
    const body = Body.parse(await request.json());
    const captchaOk = body.turnstileToken ? await verifyTurnstile(body.turnstileToken, clientIp(request.headers)) : false;
    const result = await startSession({
      user,
      language: body.language,
      audience: body.audience,
      lessonId: body.lessonId ?? null,
      clientRequestId: idem,
      queueEntryId: body.queueEntryId ?? null,
      trial: {
        deviceId: body.deviceId ?? readCookie(request.headers, DEVICE_COOKIE),
        ipPrefixHash: ipPrefixHash(request.headers),
        captchaOk,
      },
    });
    if (result.kind === "queued") {
      return json({ queued: true, queueEntryId: result.queueEntryId, position: result.position }, { status: 202 });
    }
    return json({ queued: false, session: await sessionView(result.sessionId, user.id) });
  } catch (err) {
    if (err instanceof SessionError && err.code === "SESSION_OPEN") {
      return json({ error: { code: err.code, message: err.message, sessionId: err.details?.sessionId } }, { status: 409 });
    }
    return errorResponse(toHttp(err));
  }
}
