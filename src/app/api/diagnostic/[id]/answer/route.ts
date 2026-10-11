import { z } from "zod";

import { answerItem } from "@/server/diagnostic/service";
import { errorResponse, json } from "@/server/http";

import { ownerFrom, toHttp } from "../../_shared";

const Body = z.object({
  itemId: z.string().min(1).max(64),
  chosenIndex: z.number().int().min(0).max(10),
  latencyMs: z.number().int().min(0).max(3_600_000).optional(),
});

export async function POST(request: Request, ctx: RouteContext<"/api/diagnostic/[id]/answer">) {
  try {
    const { id } = await ctx.params;
    const body = Body.parse(await request.json());
    return json(await answerItem({ attemptId: id, owner: await ownerFrom(request), ...body }));
  } catch (err) {
    return errorResponse(toHttp(err));
  }
}
