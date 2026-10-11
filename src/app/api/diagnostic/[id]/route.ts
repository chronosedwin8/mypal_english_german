import { getState } from "@/server/diagnostic/service";
import { errorResponse, json } from "@/server/http";

import { ownerFrom, toHttp } from "../_shared";

export async function GET(request: Request, ctx: RouteContext<"/api/diagnostic/[id]">) {
  try {
    const { id } = await ctx.params;
    return json(await getState(id, await ownerFrom(request)));
  } catch (err) {
    return errorResponse(toHttp(err));
  }
}
