/** Vista publica de una clase para su dueño (nunca expone datos de otros). */
import { db } from "@/server/db";
import { tavus } from "@/server/tavus";

import { signSession } from "./lifecycle";

export async function sessionView(sessionId: string, userId: string) {
  const s = await db.tutorSession.findFirst({ where: { id: sessionId, userId } });
  if (!s) return null;
  const lesson = s.lessonId ? await db.lesson.findUnique({ where: { id: s.lessonId }, select: { titleEs: true } }) : null;
  const joinable = s.status === "READY" || s.status === "LIVE";
  return {
    id: s.id,
    status: s.status,
    language: s.language,
    audience: s.audience,
    isTrial: s.isTrial,
    lessonTitle: lesson?.titleEs ?? null,
    conversationId: joinable ? s.tavusConversationId : null,
    conversationUrl: joinable ? s.conversationUrl : null,
    meetingToken: joinable ? s.meetingToken : null,
    hardDeadlineAt: s.hardDeadlineAt?.toISOString() ?? null,
    maxCallDurationSec: s.maxCallDurationSec,
    serverNow: new Date().toISOString(),
    endToken: signSession(s.id, "end"),
    driver: tavus().driver,
    billedSeconds: s.billedSeconds,
    chargedSeconds: s.chargedSeconds,
    endReason: s.endReason,
  };
}

export type SessionView = NonNullable<Awaited<ReturnType<typeof sessionView>>>;
