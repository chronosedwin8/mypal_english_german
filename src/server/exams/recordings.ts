import type { Prisma } from "@/generated/prisma/client";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

import type { SpeakingTurn } from "./speaking-script";

/**
 * Grabaciones de Speaking: se borran al vencer el plazo de la institucion de la persona
 * (el mas corto si tiene varias) o, sin institucion, el plazo general. Se conserva la
 * transcripcion y la nota; solo se borra el audio. El audio del examinador es generado
 * y compartido entre personas, asi que no se toca.
 */
export async function retentionDaysFor(userIds: string[]): Promise<Map<string, number>> {
  const fallback = (await getConfig())["exam.recordings.retentionDays"];
  const members = await db.orgMember.findMany({
    where: { userId: { in: userIds }, status: "ACTIVE" },
    select: { userId: true, org: { select: { recordingsRetentionDays: true } } },
  });
  const out = new Map(userIds.map((id) => [id, fallback]));
  const seen = new Set<string>();
  for (const m of members) {
    const days = m.org.recordingsRetentionDays;
    out.set(m.userId, seen.has(m.userId) ? Math.min(out.get(m.userId)!, days) : days);
    seen.add(m.userId);
  }
  return out;
}

async function purge(sub: { id: string; turns: unknown }): Promise<number> {
  const turns = sub.turns as SpeakingTurn[];
  let removed = 0;
  const next = await Promise.all(
    turns.map(async (t) => {
      if (t.kind !== "candidate" || !t.audioKey) return t;
      await storage()
        .remove(t.audioKey)
        .catch(() => undefined);
      removed++;
      return { ...t, audioKey: "" };
    }),
  );
  await db.speakingSubmission.update({ where: { id: sub.id }, data: { turns: next as unknown as Prisma.InputJsonValue, audioPurgedAt: new Date() } });
  return removed;
}

/** Bucle diario del worker. */
export async function purgeExpiredRecordings(now = new Date(), batch = 500): Promise<{ submissions: number; files: number }> {
  const oldest = new Date(now.getTime() - 7 * 86_400_000);
  const subs = await db.speakingSubmission.findMany({
    where: { audioPurgedAt: null, createdAt: { lt: oldest }, status: { notIn: ["IN_PROGRESS", "PENDING"] } },
    select: { id: true, turns: true, createdAt: true, attempt: { select: { userId: true } } },
    orderBy: { createdAt: "asc" },
    take: batch,
  });
  const days = await retentionDaysFor([...new Set(subs.map((s) => s.attempt.userId))]);
  let submissions = 0;
  let files = 0;
  for (const s of subs) {
    if (s.createdAt.getTime() > now.getTime() - days.get(s.attempt.userId)! * 86_400_000) continue;
    files += await purge(s);
    submissions++;
  }
  if (submissions) await db.auditLog.create({ data: { action: "recordings.purge_expired", entity: "SpeakingSubmission", after: { submissions, files } } });
  return { submissions, files };
}

/** Borrado a pedido de la persona (Ley 1581: derecho de supresion). */
export async function deleteMyRecordings(userId: string): Promise<number> {
  const subs = await db.speakingSubmission.findMany({ where: { audioPurgedAt: null, attempt: { userId } }, select: { id: true, turns: true } });
  let files = 0;
  for (const s of subs) files += await purge(s);
  await db.auditLog.create({ data: { actorUserId: userId, action: "recordings.delete_mine", entity: "User", entityId: userId, after: { submissions: subs.length, files } } });
  return files;
}

export async function recordingCount(userId: string): Promise<number> {
  return db.speakingSubmission.count({ where: { audioPurgedAt: null, attempt: { userId } } });
}
