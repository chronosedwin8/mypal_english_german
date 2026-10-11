import { z } from "zod";

import { db } from "@/server/db";
import { json } from "@/server/http";
import { confirmEnded, verifySessionSignature } from "@/server/sessions/lifecycle";

/**
 * Webhook de Tavus. Tavus no firma sus webhooks, asi que:
 *  1) la URL lleva un token HMAC por clase,
 *  2) el conversation_id debe coincidir con la clase,
 *  3) el dinero solo se mueve tras confirmar con GET a Tavus (confirmEnded).
 */
const Envelope = z.object({
  conversation_id: z.string().min(1),
  event_type: z.string().min(1),
  message_type: z.string().optional(),
  timestamp: z.string().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request, ctx: RouteContext<"/api/tavus/webhook/[token]">) {
  const { token } = await ctx.params;
  const [sessionId, sig] = token.split(".");
  if (!sessionId || !sig || !verifySessionSignature(sessionId, "webhook", sig)) {
    return json({ ok: false }, { status: 404 });
  }
  const parsed = Envelope.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ ok: false }, { status: 400 });
  const ev = parsed.data;

  const session = await db.tutorSession.findUnique({ where: { id: sessionId }, select: { tavusConversationId: true } });
  if (!session || (session.tavusConversationId && session.tavusConversationId !== ev.conversation_id)) {
    return json({ ok: false }, { status: 404 });
  }

  await db.tavusEvent
    .create({
      data: {
        sessionId,
        conversationId: ev.conversation_id,
        eventType: ev.event_type,
        eventTs: ev.timestamp ? new Date(ev.timestamp) : null,
        payload: ev as never,
        source: "WEBHOOK",
        dedupeKey: `${ev.conversation_id}:${ev.event_type}:${ev.timestamp ?? ""}`,
      },
    })
    .catch(() => null); // duplicado: ya procesado

  if (ev.event_type === "system.shutdown" || ev.event_type === "application.transcription_ready") {
    // Responder rapido; la confirmacion consulta a Tavus en segundo plano.
    void confirmEnded(sessionId).catch((err) => console.error("[webhook] confirmEnded:", err));
  }
  return json({ ok: true });
}
