import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { IELTS_LISTENING_TABLE } from "@/content/exams/scales";
import { officialAccuracy, teacherAccuracy } from "@/server/admin/accuracy";
import { lessonsFor } from "@/server/app-data";
import { invalidateConfigCache, setConfig } from "@/server/config";
import { db } from "@/server/db";
import { calibrateExam, mockFormTable } from "@/server/exams/calibration";
import { deleteMyRecordings, purgeExpiredRecordings } from "@/server/exams/recordings";
import { acceptInvitation, addLicenses, createInvitation, createOrganization } from "@/server/org";
import { storage } from "@/server/storage";

import { createTestUser, inDays, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  invalidateConfigCache();
});
afterAll(async () => {
  await db.$disconnect();
});

async function itemSet(section: "LISTENING" | "READING", questions: number) {
  return db.examItemSet.create({
    data: {
      exam: "IELTS_ACADEMIC",
      section,
      part: 1,
      taskTypes: [],
      difficulty: 6,
      topic: "t",
      content: {},
      answerKey: { questions: Object.fromEntries(Array.from({ length: questions }, (_, i) => [String(i + 1), {}])) },
      status: "APPROVED",
      promptVersion: "test",
      model: "fake",
    },
  });
}

/** 40 personas; la pregunta 5 del bloque A tiene la clave invertida (aciertan los peores). */
async function simulate() {
  const a = await itemSet("LISTENING", 10);
  const b = await itemSet("READING", 10);
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const user = await createTestUser();
  for (let k = 0; k < 40; k++) {
    const theta = -2 + (4 * k) / 39;
    const att = await db.examAttempt.create({ data: { userId: user.id, exam: "IELTS_ACADEMIC", mode: "SECTION", status: "COMPLETED", config: {} } });
    const data = [];
    for (const [set, offset] of [[a, 0], [b, 0.3]] as const) {
      for (let q = 1; q <= 10; q++) {
        const diff = -1.2 + (q - 1) / 4 + offset;
        let p = 1 / (1 + Math.exp(-(theta - diff) * 1.7));
        if (set.id === a.id && q === 5) p = 1 - p;
        data.push({ attemptId: att.id, itemSetId: set.id, questionId: String(q), answer: { value: "x" }, isCorrect: rand() < p });
      }
    }
    await db.examResponse.createMany({ data });
  }
  return { a, b, user };
}

describe("calibración con uso real", () => {
  it("guarda estadísticas, retira lo defectuoso y calibra la forma", async () => {
    await setConfig("exam.calibration.minResponses", 20, null);
    const { a, b, user } = await simulate();
    const form = await db.examForm.create({
      data: {
        exam: "IELTS_ACADEMIC",
        version: 1,
        blocks: { sections: [{ section: "LISTENING", parts: [{ part: 1, itemSetId: a.id }] }, { section: "READING", parts: [{ part: 1, itemSetId: b.id }] }] },
      },
    });

    const s = await calibrateExam("IELTS_ACADEMIC");
    expect(s).toMatchObject({ attempts: 40, questions: 20, calibrated: 20, sentToReview: 1, formsCalibrated: 1 });
    const bad = await db.examItemStat.findUniqueOrThrow({ where: { itemSetId_questionId: { itemSetId: a.id, questionId: "5" } } });
    expect(bad.flag).toBe("DEFECTIVE");
    expect(bad.discrimination!).toBeLessThan(0);
    expect(await db.examItemStat.count({ where: { flag: "DEFECTIVE" } })).toBe(1);
    expect((await db.examItemSet.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("REVIEW");
    expect((await db.examItemSet.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("APPROVED");
    expect(await db.moderationFlag.count({ where: { kind: "CALIBRATION" } })).toBe(1);

    // La forma tiene su propia tabla, y un simulacro con esa forma la usa.
    const f = await db.examForm.findUniqueOrThrow({ where: { id: form.id } });
    expect(f.calibrated).toBe(true);
    const mock = await db.examAttempt.create({ data: { userId: user.id, exam: "IELTS_ACADEMIC", mode: "MOCK", formId: form.id, config: {} } });
    const table = await mockFormTable(mock.id, "LISTENING");
    expect(table).toHaveLength(IELTS_LISTENING_TABLE.length);
    expect(table!.map(([, band]) => band)).toEqual(IELTS_LISTENING_TABLE.map(([, band]) => band));

    // Repetir la calibración no duplica alertas ni estadísticas.
    await calibrateExam("IELTS_ACADEMIC");
    expect(await db.moderationFlag.count({ where: { kind: "CALIBRATION" } })).toBe(1);
    expect(await db.examItemStat.count()).toBe(20);
  });

  it("sin respuestas suficientes la forma sigue en calibración", async () => {
    const { a, b } = await simulate();
    await setConfig("exam.calibration.minResponses", 100, null);
    await db.examForm.create({
      data: {
        exam: "IELTS_ACADEMIC",
        version: 1,
        blocks: { sections: [{ section: "LISTENING", parts: [{ part: 1, itemSetId: a.id }] }, { section: "READING", parts: [{ part: 1, itemSetId: b.id }] }] },
      },
    });
    const s = await calibrateExam("IELTS_ACADEMIC");
    expect(s).toMatchObject({ calibrated: 0, defective: 0, sentToReview: 0, formsCalibrated: 0 });
  });
});

describe("precisión", () => {
  it("compara el simulador con la nota oficial y la IA con el docente", async () => {
    const u = await createTestUser();
    await db.examAttempt.create({
      data: {
        userId: u.id,
        exam: "IELTS_ACADEMIC",
        mode: "MOCK",
        status: "COMPLETED",
        completedAt: inDays(-20),
        config: {},
        scores: {
          overall: 7,
          cefr: "C1",
          listening: { correct: 30, total: 40, band: 7 },
          reading: { correct: 28, total: 40, band: 6.5 },
          writing: { task1: 6, task2: 6.5, band: 6.5 },
          speaking: { band: 7.5, criteria: {} },
        },
      },
    });
    await db.officialResult.create({ data: { userId: u.id, exam: "IELTS_ACADEMIC", takenAt: inDays(-5), scores: { overall: 6.5, listening: 7, reading: 6.5, writing: 6, speaking: 6.5 } } });
    const off = await officialAccuracy();
    expect(off.pairs).toBe(1);
    expect(off.bySection.overall).toMatchObject({ n: 1, bias: 0.5, within: 1 });
    expect(off.bySection.speaking).toMatchObject({ bias: 1, within: 0 });

    const att = await db.examAttempt.create({ data: { userId: u.id, exam: "IELTS_ACADEMIC", mode: "WRITING", config: {} } });
    const sub = await db.writingSubmission.create({ data: { attemptId: att.id, taskNumber: 2, itemSetId: "x", text: "t", words: 1, finalScore: 7 } });
    await db.teacherReview.createMany({
      data: [
        { kind: "WRITING", submissionId: sub.id, reviewerMemberId: "m", aiScore: 7, score: 6, reason: "primera" },
        { kind: "WRITING", submissionId: sub.id, reviewerMemberId: "m", aiScore: 7, score: 6.5, reason: "corrige" },
      ],
    });
    const t = await teacherAccuracy();
    expect(t).toEqual([{ exam: "IELTS_ACADEMIC", kind: "WRITING", stats: { n: 1, bias: 0.5, mae: 0.5, within: 1 } }]);
  });
});

describe("grabaciones de Speaking", () => {
  async function recording(userId: string, daysAgo: number) {
    const att = await db.examAttempt.create({ data: { userId, exam: "IELTS_ACADEMIC", mode: "SPEAKING", status: "COMPLETED", config: {} } });
    const key = `test/rec/${att.id}.webm`;
    await storage().put(key, Buffer.from("voz"), "audio/webm");
    await storage().put("test/examiner/shared.mp3", Buffer.from("x"), "audio/mpeg");
    const sub = await db.speakingSubmission.create({
      data: {
        attemptId: att.id,
        part: 1,
        status: "GRADED",
        createdAt: inDays(-daysAgo),
        turns: [
          { kind: "examiner", text: "Q", expects: "answer", audioKey: "test/examiner/shared.mp3" },
          { kind: "candidate", audioKey: key, transcript: "hello", durationMs: 1000, words: [] },
        ],
      },
    });
    return { sub, key };
  }

  it("se borran al vencer el plazo de la institución; sin institución, el plazo general", async () => {
    const orgAdmin = await createTestUser();
    const org = await createOrganization({ name: "Colegio", type: "SCHOOL", enabledExams: ["IELTS_ACADEMIC"], adminUserId: orgAdmin.id });
    await db.organization.update({ where: { id: org.id }, data: { recordingsRetentionDays: 30 } });
    await addLicenses({ orgId: org.id, kind: "estandar", seats: 2, months: 6 });
    const student = await createTestUser();
    const inv = await createInvitation({ orgId: org.id, role: "STUDENT" });
    await acceptInvitation({ code: inv.code, userId: student.id, email: student.email });
    const solo = await createTestUser();

    const inOrg = await recording(student.id, 40);
    const recent = await recording(student.id, 10);
    const alone = await recording(solo.id, 40);

    expect(await purgeExpiredRecordings()).toEqual({ submissions: 1, files: 1 });
    expect(await storage().exists(inOrg.key)).toBe(false);
    expect(await storage().exists("test/examiner/shared.mp3")).toBe(true);
    const purged = await db.speakingSubmission.findUniqueOrThrow({ where: { id: inOrg.sub.id } });
    expect(purged.audioPurgedAt).not.toBeNull();
    expect((purged.turns as { audioKey: string; transcript?: string }[])[1]).toMatchObject({ audioKey: "", transcript: "hello" });
    expect(await storage().exists(recent.key)).toBe(true);
    expect(await storage().exists(alone.key)).toBe(true); // plazo general: 180 días

    // Borrado a pedido.
    expect(await deleteMyRecordings(solo.id)).toBe(1);
    expect(await storage().exists(alone.key)).toBe(false);
    expect(await db.auditLog.count({ where: { action: "recordings.delete_mine" } })).toBe(1);
  });
});

describe("examinador con avatar", () => {
  it("las lecciones de examen solo aparecen con el interruptor encendido", async () => {
    await db.module.create({
      data: { id: "en-examen-ielts-speaking", lang: "EN", level: "B2", slug: "examen-ielts-speaking", titleEs: "Examen", descriptionEs: "d", sortOrder: 99 },
    });
    await db.module.create({ data: { id: "en-viajes", lang: "EN", level: "A2", slug: "viajes", titleEs: "Viajes", descriptionEs: "d", sortOrder: 1 } });
    expect((await lessonsFor("EN_US")).map((m) => m.slug)).toEqual(["viajes"]);
    await setConfig("exam.avatarExaminer", true, null);
    expect((await lessonsFor("EN_US")).map((m) => m.slug)).toEqual(["viajes", "examen-ielts-speaking"]);
  });
});
