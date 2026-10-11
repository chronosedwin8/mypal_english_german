import { z } from "zod";

import { getUserFromRequest } from "@/server/auth/dal";
import { db } from "@/server/db";
import { HttpError, errorResponse, json } from "@/server/http";
import { addVocabulary } from "@/server/learning/vocabulary";

/** Herramientas del tutor: llegan al navegador por Daily y se reenvian aqui. */
const Body = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("save_vocabulary"),
    arguments: z.object({
      term: z.string().trim().min(1).max(80),
      translation_es: z.string().trim().max(120).optional(),
      example: z.string().trim().max(240).optional(),
    }),
  }),
  z.object({
    name: z.literal("log_correction"),
    arguments: z.object({
      original: z.string().trim().min(1).max(300),
      corrected: z.string().trim().min(1).max(300),
      explanation_es: z.string().trim().max(300).optional(),
    }),
  }),
]);

const MAX_EVENTS_PER_SESSION = 80;

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/events">) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Ingresa primero.");
    const { id } = await ctx.params;
    const session = await db.tutorSession.findFirst({ where: { id, userId: user.id }, select: { id: true, language: true } });
    if (!session) throw new HttpError(404, "NOT_FOUND", "Clase no encontrada.");
    const [vocab, corrections] = await Promise.all([
      db.vocabularyItem.count({ where: { sessionId: id } }),
      db.sessionCorrection.count({ where: { sessionId: id } }),
    ]);
    if (vocab + corrections >= MAX_EVENTS_PER_SESSION) return json({ ok: true, ignored: true });

    const body = Body.parse(await request.json());
    if (body.name === "save_vocabulary") {
      await addVocabulary({
        userId: user.id,
        language: session.language,
        term: body.arguments.term,
        translationEs: body.arguments.translation_es ?? null,
        example: body.arguments.example ?? null,
        source: "TOOL_CALL",
        sessionId: id,
      });
    } else {
      await db.sessionCorrection.create({
        data: {
          sessionId: id,
          userId: user.id,
          original: body.arguments.original,
          corrected: body.arguments.corrected,
          explanation: body.arguments.explanation_es ?? null,
        },
      });
    }
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
