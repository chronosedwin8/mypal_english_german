import { submitSpeaking } from "@/server/diagnostic/service";
import { HttpError, errorResponse, json } from "@/server/http";

import { ownerFrom, toHttp } from "../../_shared";

export async function POST(request: Request, ctx: RouteContext<"/api/diagnostic/[id]/speaking">) {
  try {
    const { id } = await ctx.params;
    const form = await request.formData();
    const audio = form.get("audio");
    const taskId = String(form.get("taskId") ?? "");
    const durationMs = Number(form.get("durationMs") ?? 0);
    if (!(audio instanceof Blob) || !taskId) throw new HttpError(400, "INVALID_INPUT", "Falta la grabación.");
    return json(
      await submitSpeaking({
        attemptId: id,
        owner: await ownerFrom(request),
        taskId,
        audio,
        durationMs: Number.isFinite(durationMs) ? durationMs : 0,
      }),
    );
  } catch (err) {
    return errorResponse(toHttp(err));
  }
}
