import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { fakeAi } from "@/server/ai/fake";
import { invalidateConfigCache, setConfig } from "@/server/config";
import { db } from "@/server/db";
import { produceBlock } from "@/server/exams/bank/pipeline";
import { bankTargets } from "@/server/exams/bank/targets";
import { assembleForm } from "@/server/exams/forms";
import { processJobs } from "@/server/jobs/handlers";
import { enqueue } from "@/server/jobs/queue";
import { storage } from "@/server/storage";

import { GOOD_VERDICT, listeningFixture, perfectAnswers, readingFixture } from "../fixtures/bank";
import { resetDatabase } from "./helpers";

process.env.ELEVENLABS_EXAM_VOICES_EN = "v1:Alice-UK-F,v2:George-UK-M,v3:Sarah-US-F";
process.env.ELEVENLABS_EXAMINER_EN = "v2";

beforeEach(async () => {
  await resetDatabase();
  invalidateConfigCache();
  fakeAi.reset();
  // Sin muestra aleatoria de revision humana: resultados deterministas.
  await setConfig("exam.bank.humanReviewSample", 0, null);
});
afterAll(async () => {
  await db.$disconnect();
});

function happyPath(kind: "reading" | "listening") {
  const block = kind === "reading" ? readingFixture() : listeningFixture();
  fakeAi.respond("bank.generate", () => block);
  fakeAi.respond("bank.solve", () => perfectAnswers(block));
  fakeAi.respond("bank.judge", () => GOOD_VERDICT);
  return block;
}

describe("pipeline del banco", () => {
  it("un bloque de Reading valido queda aprobado y sin la clave en el contenido", async () => {
    happyPath("reading");
    const r = await produceBlock({ exam: "IELTS_ACADEMIC", section: "READING", part: 1 });
    expect(r.status).toBe("APPROVED");
    const item = await db.examItemSet.findUniqueOrThrow({ where: { id: r.itemSetId } });
    expect(item.taskTypes).toEqual(["TRUE_FALSE_NOT_GIVEN", "SENTENCE_COMPLETION"]);
    expect(item.difficulty).toBe(6.5);
    expect(JSON.stringify(item.content)).not.toMatch(/"answers"|"evidence"/);
    const key = item.answerKey as { questions: Record<string, { answers: string[] }>; qa: { rounds: unknown[] } };
    expect(key.questions["7"].answers).toEqual(["sediment"]);
    expect(key.qa.rounds).toHaveLength(1);
  });

  it("corrige una vez cuando la validacion falla", async () => {
    const bad = readingFixture();
    bad.groups[1].questions[0].answers = ["mud"];
    const good = happyPath("reading");
    fakeAi.respond("bank.generate", () => bad);
    let repairPrompt = "";
    fakeAi.respond("bank.repair", (opts) => {
      repairPrompt = opts.prompt;
      return good;
    });
    const r = await produceBlock({ exam: "IELTS_ACADEMIC", section: "READING", part: 1 });
    expect(r.status).toBe("APPROVED");
    expect(repairPrompt).toMatch(/Q7: the answer "mud" must appear/);
    const qa = ((await db.examItemSet.findUniqueOrThrow({ where: { id: r.itemSetId } })).answerKey as { qa: { rounds: { issues: string[] }[] } }).qa;
    expect(qa.rounds).toHaveLength(2);
    expect(qa.rounds[0].issues.length).toBeGreaterThan(0);
  });

  it("rechaza si el resolutor a ciegas encuentra dos respuestas y la correccion no lo arregla", async () => {
    const block = happyPath("reading");
    fakeAi.respond("bank.solve", () => {
      const p = perfectAnswers(block);
      p.answers[2] = { number: 3, answer: "NOT GIVEN", alternative: "FALSE", confidence: 0.5 };
      return p;
    });
    fakeAi.respond("bank.repair", () => block);
    const r = await produceBlock({ exam: "IELTS_ACADEMIC", section: "READING", part: 1 });
    expect(r.status).toBe("REJECTED");
    expect(r.issues.join()).toMatch(/Q3: "FALSE" is also defensible/);
    const item = await db.examItemSet.findUniqueOrThrow({ where: { id: r.itemSetId } });
    expect(item.status).toBe("REJECTED");
    expect(item.reviewNote).toMatch(/Q3/);
  });

  it("acepta variantes validas del resolutor en preguntas de completar", async () => {
    const block = happyPath("reading");
    fakeAi.respond("bank.solve", () => {
      const p = perfectAnswers(block);
      p.answers[7] = { number: 8, answer: "local granite", alternative: null, confidence: 0.9 };
      return p;
    });
    const r = await produceBlock({ exam: "IELTS_ACADEMIC", section: "READING", part: 1 });
    expect(r.status).toBe("APPROVED");
    const key = (await db.examItemSet.findUniqueOrThrow({ where: { id: r.itemSetId } })).answerKey as { questions: Record<string, { answers: string[] }> };
    expect(key.questions["8"].answers).toEqual(["granite", "local granite"]);
  });

  it("rechaza si el juez lo califica bajo", async () => {
    const block = happyPath("reading");
    fakeAi.respond("bank.judge", () => ({ ...GOOD_VERDICT, overall: 5, problems: ["Too easy for the target band."] }));
    fakeAi.respond("bank.repair", () => block);
    const r = await produceBlock({ exam: "IELTS_ACADEMIC", section: "READING", part: 1 });
    expect(r.status).toBe("REJECTED");
    expect(r.issues).toContain("Too easy for the target band.");
  });

  it("si el juez duda de la clave, va a revision humana", async () => {
    happyPath("reading");
    fakeAi.respond("bank.judge", () => ({ ...GOOD_VERDICT, problems: ["Question 9 is ambiguous."] }));
    const r = await produceBlock({ exam: "IELTS_ACADEMIC", section: "READING", part: 1 });
    expect(r.status).toBe("REVIEW");
  });

  it("Listening: genera el audio, lo guarda y lo verifica", async () => {
    happyPath("listening");
    const r = await produceBlock({ exam: "IELTS_ACADEMIC", section: "LISTENING", part: 4 });
    expect(r.status).toBe("APPROVED");
    const assets = await db.audioAsset.findMany({ where: { itemSetId: r.itemSetId } });
    expect(assets).toHaveLength(1);
    expect(assets[0].durationMs).toBeGreaterThan(1000);
    expect(assets[0].transcriptCheck).toBe(1);
    expect((assets[0].voices as Record<string, { id: string }>).NARRATOR.id).toBe("v2");
    expect(await storage().get(assets[0].storageKey)).not.toBeNull();
    // el guion no esta en el contenido publico
    const item = await db.examItemSet.findUniqueOrThrow({ where: { id: r.itemSetId } });
    expect(JSON.stringify(item.content)).not.toMatch(/relied on copper/);
  });
});

describe("reposicion y formas", () => {
  it("el worker procesa un trabajo de generación", async () => {
    happyPath("reading");
    const job = await enqueue("bank.generate", { exam: "IELTS_ACADEMIC", section: "READING", part: 1 });
    expect(await processJobs(2)).toBe(1);
    const done = await db.examJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done.status).toBe("DONE");
    expect((done.result as { status: string }).status).toBe("APPROVED");
  });

  it("arma formas sin repetir bloques", async () => {
    const targets = bankTargets("IELTS_ACADEMIC");
    expect(await assembleForm("IELTS_ACADEMIC")).toMatchObject({ ok: false });
    for (const t of targets)
      await db.examItemSet.create({
        data: {
          exam: t.exam,
          section: t.section,
          part: t.part,
          taskTypes: [],
          difficulty: 6.5,
          topic: `${t.section} ${t.part}`,
          content: {},
          answerKey: {},
          status: "APPROVED",
          promptVersion: "test",
          model: "fake",
        },
      });
    const first = await assembleForm("IELTS_ACADEMIC");
    expect(first).toMatchObject({ ok: true, version: 1 });
    const second = await assembleForm("IELTS_ACADEMIC");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.missing).toHaveLength(targets.length);
  });
});
