import { z } from "zod";

import { startAttempt } from "@/server/diagnostic/service";
import { HttpError, errorResponse, json } from "@/server/http";
import { clientIp, ipPrefixHash, verifyTurnstile } from "@/server/security";

import { ownerFrom, setAnonCookie, toHttp } from "../_shared";

const Body = z.object({
  language: z.enum(["EN_US", "EN_GB", "DE"]),
  turnstileToken: z.string().min(1).max(4096),
});

export async function POST(request: Request) {
  try {
    const body = Body.parse(await request.json());
    if (!(await verifyTurnstile(body.turnstileToken, clientIp(request.headers)))) {
      throw new HttpError(403, "CAPTCHA_FAILED", "No pudimos verificar que eres humano. Recarga la página.");
    }
    const owner = await ownerFrom(request);
    const state = await startAttempt({
      language: body.language,
      owner,
      ipPrefixHash: ipPrefixHash(request.headers),
    });
    const res = json(state);
    if (owner.newAnonId) setAnonCookie(res, owner.newAnonId);
    return res;
  } catch (err) {
    return errorResponse(toHttp(err));
  }
}
