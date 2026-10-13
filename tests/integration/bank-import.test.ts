import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { fakeAi } from "@/server/ai/fake";
import { invalidateConfigCache } from "@/server/config";
import { db } from "@/server/db";
import { importEntry } from "@/server/exams/bank/import";

import { listeningFixture, readingFixture } from "../fixtures/bank";
import { resetDatabase } from "./helpers";

process.env.ELEVENLABS_EXAM_VOICES_EN = "v1:Alice-UK-F,v2:George-UK-M,v3:Sarah-US-F";
process.env.ELEVENLABS_EXAMINER_EN = "v2";

beforeEach(async () => {
  await resetDatabase();
  invalidateConfigCache();
  fakeAi.reset();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("importar bloques escritos por el equipo", () => {
  it("valida, guarda aprobado sin la clave en el contenido y no duplica", async () => {
    const entry = { exam: "IELTS_ACADEMIC", section: "READING", part: 1, block: readingFixture() };
    const r = await importEntry(entry);
    expect(r).toMatchObject({ status: "APPROVED", issues: [] });
    const item = await db.examItemSet.findUniqueOrThrow({ where: { id: r.itemSetId } });
    expect(item).toMatchObject({ promptVersion: "import-v1", model: "autor", costMicroUsd: BigInt(0) });
    expect(item.taskTypes.length).toBeGreaterThan(0);
    expect(JSON.stringify(item.content)).not.toMatch(/"answers"|"evidence"/);
    // Ninguna llamada a la API de IA.
    expect(await db.aiUsage.count({ where: { provider: "gemini" } })).toBe(0);

    expect(await importEntry(entry)).toMatchObject({ status: "SKIPPED", itemSetId: r.itemSetId });
    expect(await db.examItemSet.count()).toBe(1);
  });

  it("un bloque con problemas no se guarda y explica qué corregir", async () => {
    const block = readingFixture();
    block.groups[0].questions[0].evidence = "words that are not in the passage at all";
    const r = await importEntry({ exam: "IELTS_ACADEMIC", section: "READING", part: 1, block });
    expect(r.status).toBe("INVALID");
    expect(r.issues.join(" ")).toMatch(/evidence/);
    expect(await importEntry({ exam: "IELTS_ACADEMIC", section: "WRITING", part: 3, block: {} })).toMatchObject({ status: "INVALID" });
    expect(await importEntry({ exam: "NO_EXISTE", section: "READING", part: 1, block: {} })).toMatchObject({ status: "INVALID" });
    expect(await db.examItemSet.count()).toBe(0);
  });

  it("Listening: genera y verifica el audio; con --review queda por revisar", async () => {
    const r = await importEntry({ exam: "IELTS_ACADEMIC", section: "LISTENING", part: 4, block: listeningFixture() }, { review: true });
    expect(r.status).toBe("REVIEW");
    const assets = await db.audioAsset.findMany({ where: { itemSetId: r.itemSetId } });
    expect(assets).toHaveLength(1);
    expect(assets[0].transcriptCheck).toBe(1);
  });

  it("simulación: valida sin guardar", async () => {
    const r = await importEntry({ exam: "IELTS_ACADEMIC", section: "READING", part: 1, block: readingFixture() }, { dryRun: true });
    expect(r.status).toBe("SKIPPED");
    expect(await db.examItemSet.count()).toBe(0);
  });
});
