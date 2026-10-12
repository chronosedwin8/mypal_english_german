import { speakingState } from "@/server/exams/speaking";
import { errorResponse, json } from "@/server/http";

import { speakingUser, toHttp } from "../_shared";

export async function GET(request: Request, ctx: RouteContext<"/api/exams/speaking/[id]">) {
  try {
    const { id } = await ctx.params;
    const user = await speakingUser(request);
    return json(await speakingState(id, user.id));
  } catch (err) {
    return errorResponse(toHttp(err));
  }
}
