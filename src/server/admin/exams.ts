/** Consultas del admin de examenes: banco, trabajos, formas y gasto de IA/voz. */
import "server-only";

import type { ItemSetStatus } from "@/generated/prisma/client";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { bankInventory } from "@/server/exams/bank/planner";
import { formItemSetIds } from "@/server/exams/forms";
import { storage } from "@/server/storage";

function monthStart() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
function dayStart() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function examBankOverview(status: ItemSetStatus | "ALL") {
  const config = await getConfig();
  const [inventory, blocks, jobs, forms, today, month, voice, byPurpose] = await Promise.all([
    bankInventory(),
    db.examItemSet.findMany({
      where: status === "ALL" ? {} : { status },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, exam: true, section: true, part: true, topic: true, status: true, difficulty: true, qualityScore: true, costMicroUsd: true, createdAt: true, taskTypes: true },
    }),
    db.examJob.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    db.examForm.findMany({ orderBy: [{ exam: "asc" }, { version: "desc" }], take: 20 }),
    db.aiUsage.aggregate({ where: { createdAt: { gte: dayStart() } }, _sum: { costMicroUsd: true } }),
    db.aiUsage.aggregate({ where: { createdAt: { gte: monthStart() } }, _sum: { costMicroUsd: true } }),
    db.aiUsage.aggregate({ where: { provider: "elevenlabs", createdAt: { gte: monthStart() } }, _sum: { characters: true } }),
    db.aiUsage.groupBy({ by: ["purpose"], where: { createdAt: { gte: monthStart() } }, _sum: { costMicroUsd: true }, _count: true }),
  ]);
  return {
    config: {
      minPerPart: config["exam.bank.minPerPart"],
      dailyBudgetUsd: config["ai.dailyBudgetUsd"],
      monthlyCharBudget: config["voice.monthlyCharBudget"],
    },
    inventory,
    blocks,
    jobs,
    forms: forms.map((f) => ({ ...f, count: formItemSetIds(f.blocks).length })),
    spend: {
      todayMicroUsd: today._sum.costMicroUsd ?? BigInt(0),
      monthMicroUsd: month._sum.costMicroUsd ?? BigInt(0),
      voiceChars: voice._sum.characters ?? 0,
      byPurpose: byPurpose
        .map((p) => ({ purpose: p.purpose, calls: p._count, microUsd: p._sum.costMicroUsd ?? BigInt(0) }))
        .sort((a, b) => Number(b.microUsd - a.microUsd)),
    },
  };
}

export async function examBlockDetail(id: string) {
  const item = await db.examItemSet.findUnique({ where: { id }, include: { audio: { orderBy: { storageKey: "asc" } } } });
  if (!item) return null;
  const seconds = (await getConfig())["exam.audioUrlSeconds"];
  const audio = await Promise.all(item.audio.map(async (a) => ({ ...a, url: await storage().signedUrl(a.storageKey, seconds) })));
  const forms = await db.examForm.findMany({ where: { exam: item.exam }, select: { version: true, blocks: true } });
  const inForms = forms.filter((f) => formItemSetIds(f.blocks).includes(id)).map((f) => f.version);
  return { item, audio, inForms };
}
