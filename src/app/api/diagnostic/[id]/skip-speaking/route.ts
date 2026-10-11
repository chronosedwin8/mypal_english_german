import { skipSpeaking } from "@/server/diagnostic/service";
import { errorResponse, json } from "@/server/http";

import { ownerFrom, toHttp } from "../../_shared";

export async function POST(request: Request, ctx: RouteContext<"/api/diagnostic/[id]/skip-speaking">) {
  try {
    const { id } = await ctx.params;
    return json(await skipSpeaking(id, await ownerFrom(request)));
  } catch (err) {
    return errorResponse(toHttp(err));
  }
}
