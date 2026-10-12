import { answerSpeaking } from "@/server/exams/speaking";
import { HttpError, errorResponse, json } from "@/server/http";

import { speakingUser, toHttp } from "../../_shared";

/** Respuesta grabada de la persona (audio) → transcripcion → siguiente pregunta. */
export async function POST(request: Request, ctx: RouteContext<"/api/exams/speaking/[id]/turn">) {
  try {
    const { id } = await ctx.params;
    const user = await speakingUser(request);
    const form = await request.formData();
    const audio = form.get("audio");
    const durationMs = Number(form.get("durationMs") ?? 0);
    if (!(audio instanceof Blob)) throw new HttpError(400, "INVALID_INPUT", "Falta la grabación.");
    return json(await answerSpeaking({ attemptId: id, userId: user.id, audio, durationMs: Number.isFinite(durationMs) ? durationMs : 0 }));
  } catch (err) {
    return errorResponse(toHttp(err));
  }
}
