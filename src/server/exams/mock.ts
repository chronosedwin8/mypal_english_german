/**
 * Simulacro completo IELTS: Listening → Reading → Writing (dos tareas, 60 min) y
 * Speaking el mismo dia o despues. Cada seccion reutiliza su motor (practica
 * cronometrada, Writing y Speaking) como intento "hijo"; este modulo ordena las
 * secciones, usa una forma que la persona no ha visto, maneja el cupo MOCK y arma
 * el informe final con la escala oficial.
 */
import { z } from "zod";

import { examSpec, sectionSpec } from "@/content/exams";
import { ieltsOverall, ieltsToCefr, ieltsWritingBand } from "@/content/exams/scales";
import type { ExamCode, ExamSectionCode } from "@/content/exams/types";
import type { Prisma } from "@/generated/prisma/client";
import { can } from "@/server/access";
import { ai } from "@/server/ai";
import type { CurrentUser } from "@/server/auth/dal";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { examReportEmail, sendEmail } from "@/server/email";
import { addMockImprovements, markPlanProgress } from "@/server/study/plan";

import { consumeQuota, releaseQuota, reserveQuota } from "./entitlements";
import { assembleForm, formItemSetIds, type FormBlocks } from "./forms";
import { createObjectiveAttempt, type PracticeScores } from "./practice";
import { startSpeaking } from "./speaking";
import { createMockWriting, submitWriting, type WritingFeedback } from "./writing";

export const MOCK_STAGES = ["LISTENING", "READING", "WRITING", "SPEAKING"] as const;
export type MockStage = (typeof MOCK_STAGES)[number];

/** Orden del simulacro de cada examen (Goethe empieza por Lesen). */
export function stageOrder(exam: ExamCode): MockStage[] {
  return examSpec(exam).mockOrder as MockStage[];
}
type StageStatus = "PENDING" | "ACTIVE" | "DONE" | "SKIPPED";

export interface MockConfig {
  formId: string;
  formVersion: number;
  stages: Record<MockStage, { status: StageStatus; attemptIds: string[]; startedAt?: string; doneAt?: string }>;
}

export class MockError extends Error {
  constructor(
    readonly code: "NO_ACCESS" | "NO_CONTENT" | "NOT_FOUND" | "ORDER",
    message: string,
  ) {
    super(message);
    this.name = "MockError";
  }
}

/* ───────────────────────── empezar ───────────────────────── */

async function pickForm(userId: string, exam: ExamCode) {
  const seen = new Set((await db.itemExposure.findMany({ where: { userId, itemSet: { exam } }, select: { itemSetId: true } })).map((s) => s.itemSetId));
  const usedForms = new Set(
    (await db.examAttempt.findMany({ where: { userId, exam, mode: "MOCK", formId: { not: null } }, select: { formId: true } })).map((a) => a.formId),
  );
  const forms = await db.examForm.findMany({ where: { exam, status: "APPROVED" }, orderBy: { version: "asc" } });
  // Primero formas sin ningun bloque visto; si no hay, una forma no usada en simulacros.
  return (
    forms.find((f) => !usedForms.has(f.id) && formItemSetIds(f.blocks).every((id) => !seen.has(id))) ??
    forms.find((f) => !usedForms.has(f.id)) ??
    null
  );
}

export async function startMock(user: Pick<CurrentUser, "id" | "role">, exam: ExamCode): Promise<{ mockId: string }> {
  const open = await db.examAttempt.findFirst({ where: { userId: user.id, mode: "MOCK", status: { in: ["IN_PROGRESS", "SCORING"] } } });
  if (open) return { mockId: open.id };
  const access = await can(user, "exam.mock");
  if (!access.allowed) throw new MockError("NO_ACCESS", access.reason ?? "Necesitas un simulacro disponible en tu plan.");
  let form = await pickForm(user.id, exam);
  if (!form) {
    // Se arma una forma nueva con bloques aprobados que nadie ha usado en formas.
    const r = await assembleForm(exam);
    if (r.ok) form = await db.examForm.findUnique({ where: { id: r.formId } });
  }
  if (!form) throw new MockError("NO_CONTENT", "Estamos preparando nuevas formas de simulacro. Vuelve a intentarlo pronto.");
  const stages = Object.fromEntries(MOCK_STAGES.map((s) => [s, { status: "PENDING", attemptIds: [] }])) as unknown as MockConfig["stages"];
  const config: MockConfig = { formId: form.id, formVersion: form.version, stages };
  let mock;
  try {
    mock = await db.examAttempt.create({
      data: { userId: user.id, exam, mode: "MOCK", formId: form.id, config: config as unknown as Prisma.InputJsonValue },
    });
  } catch {
    // Carrera: otro clic ya abrio el simulacro (indice unico de un simulacro abierto).
    const again = await db.examAttempt.findFirst({ where: { userId: user.id, mode: "MOCK", status: { in: ["IN_PROGRESS", "SCORING"] } } });
    if (again) return { mockId: again.id };
    throw new MockError("NO_CONTENT", "No pudimos abrir el simulacro.");
  }
  try {
    await reserveQuota({ userId: user.id, kind: "MOCK", refId: mock.id, unlimited: access.unlimited });
  } catch (err) {
    await db.examAttempt.update({ where: { id: mock.id }, data: { status: "VOIDED" } });
    throw err;
  }
  return { mockId: mock.id };
}

async function loadMock(mockId: string, userId: string) {
  const mock = await db.examAttempt.findFirst({ where: { id: mockId, userId, mode: "MOCK" }, include: { form: true } });
  if (!mock || !mock.form) throw new MockError("NOT_FOUND", "No encontramos ese simulacro.");
  return { mock, config: mock.config as unknown as MockConfig, blocks: mock.form.blocks as unknown as FormBlocks };
}

function sectionBlocks(blocks: FormBlocks, section: ExamSectionCode): string[] {
  return (blocks.sections.find((s) => s.section === section)?.parts ?? []).sort((a, b) => a.part - b.part).map((p) => p.itemSetId);
}

async function saveConfig(mockId: string, config: MockConfig) {
  await db.examAttempt.update({ where: { id: mockId }, data: { config: config as unknown as Prisma.InputJsonValue } });
}

/** Empieza la siguiente seccion (en orden). Devuelve la ruta de la pantalla de esa seccion. */
export async function startMockStage(mockId: string, user: Pick<CurrentUser, "id" | "role">, stage: MockStage): Promise<string> {
  await syncMock(mockId);
  const { mock, config, blocks } = await loadMock(mockId, user.id);
  if (mock.status !== "IN_PROGRESS") throw new MockError("ORDER", "Este simulacro ya terminó.");
  const st = config.stages[stage];
  if (st.status === "ACTIVE") return stageUrl(mockId, stage, st.attemptIds);
  if (st.status !== "PENDING") throw new MockError("ORDER", "Esa sección ya está cerrada: en el examen no se puede volver atrás.");
  const order = stageOrder(mock.exam);
  const idx = order.indexOf(stage);
  if (order.slice(0, idx).some((s) => config.stages[s].status === "PENDING" || config.stages[s].status === "ACTIVE"))
    throw new MockError("ORDER", `Las secciones van en orden: ${order.map((s) => sectionSpec(mock.exam, s).name).join(", ")}.`);

  const exam = mock.exam;
  let attemptIds: string[];
  if (stage === "LISTENING" || stage === "READING") {
    const spec = sectionSpec(exam, stage);
    const r = await createObjectiveAttempt({
      userId: user.id,
      exam,
      mode: "SECTION",
      section: stage,
      part: null,
      taskType: null,
      itemSetIds: sectionBlocks(blocks, stage),
      minutes: spec.minutes + (spec.reviewMinutes ?? 0),
      mockId,
    });
    attemptIds = [r.attemptId];
  } else if (stage === "WRITING") {
    const spec = sectionSpec(exam, "WRITING");
    const deadlineAt = new Date(Date.now() + spec.minutes * 60_000);
    const tasks = (blocks.sections.find((x) => x.section === "WRITING")?.parts ?? []).sort((a, b) => a.part - b.part);
    attemptIds = [];
    for (const t of tasks) attemptIds.push((await createMockWriting({ userId: user.id, exam, task: t.part, itemSetId: t.itemSetId, deadlineAt, mockId })).attemptId);
  } else {
    const speakingParts = (blocks.sections.find((x) => x.section === "SPEAKING")?.parts ?? []).sort((a, b) => a.part - b.part);
    if (exam === "IELTS_ACADEMIC") {
      const [p1, p2] = speakingParts.map((p) => p.itemSetId);
      attemptIds = [(await startSpeaking(user, { exam, parts: [1, 2, 3], mock: { mockId, p1, p2 } })).attemptId];
    } else {
      const byPart = Object.fromEntries(speakingParts.map((p) => [String(p.part), p.itemSetId]));
      attemptIds = [(await startSpeaking(user, { exam, parts: speakingParts.map((p) => p.part), mock: { mockId, byPart } })).attemptId];
    }
  }
  // El simulacro se descuenta al empezar su primera seccion.
  if (idx === 0) await consumeQuota({ userId: user.id, kind: "MOCK", refId: mockId });
  config.stages[stage] = { status: "ACTIVE", attemptIds, startedAt: new Date().toISOString() };
  await saveConfig(mockId, config);
  return stageUrl(mockId, stage, attemptIds);
}

export function stageUrl(mockId: string, stage: MockStage, attemptIds: string[]): string {
  if (stage === "WRITING") return `/app/examenes/simulacro/${mockId}/writing`;
  if (stage === "SPEAKING") return `/app/examenes/speaking/${attemptIds[0]}`;
  return `/app/examenes/practica/${attemptIds[0]}`;
}

/** Dejar el Speaking para despues no aplica si ya empezo; omitirlo cierra el simulacro sin Speaking. */
export async function skipMockSpeaking(mockId: string, userId: string) {
  const { config } = await loadMock(mockId, userId);
  if (config.stages.SPEAKING.status !== "PENDING") return;
  if (config.stages.WRITING.status !== "DONE") throw new MockError("ORDER", "Primero termina Writing.");
  config.stages.SPEAKING.status = "SKIPPED";
  await saveConfig(mockId, config);
  await syncMock(mockId);
}

/** Entrega las dos tareas de Writing del simulacro (con lo ultimo guardado). */
export async function submitMockWriting(mockId: string, user: Pick<CurrentUser, "id" | "role">, texts: Record<string, string>) {
  const { config } = await loadMock(mockId, user.id);
  for (const id of config.stages.WRITING.attemptIds) {
    const existing = await db.writingSubmission.findFirst({ where: { attemptId: id } });
    if (!existing) await submitWriting(id, user, texts[id]);
  }
  await syncMock(mockId);
}

/* ───────────────────────── avanzar y cerrar ───────────────────────── */

/** Revisa las secciones activas: si terminaron, las cierra; si todo termino y esta calificado, arma el informe. */
export async function syncMock(mockId: string) {
  const mock = await db.examAttempt.findUnique({ where: { id: mockId } });
  if (!mock || (mock.status !== "IN_PROGRESS" && mock.status !== "SCORING")) return;
  const config = mock.config as unknown as MockConfig;
  let changed = false;
  for (const stage of MOCK_STAGES) {
    const st = config.stages[stage];
    if (st.status !== "ACTIVE") continue;
    const children = await db.examAttempt.findMany({ where: { id: { in: st.attemptIds } }, include: { sections: true, writing: true } });
    let done = false;
    if (stage === "WRITING") {
      const deadline = children[0]?.sections[0]?.deadlineAt;
      const expired = deadline && deadline.getTime() + 15_000 < Date.now();
      if (expired) {
        // Tiempo vencido: se entrega lo ultimo guardado.
        for (const c of children)
          if (!c.writing.length) await submitWriting(c.id, { id: mock.userId, role: "STUDENT" }).catch(() => undefined);
      }
      const subs = await db.writingSubmission.count({ where: { attemptId: { in: st.attemptIds } } });
      done = subs === st.attemptIds.length || Boolean(expired);
    } else {
      done = children.every((c) => c.status !== "IN_PROGRESS");
    }
    if (done) {
      st.status = "DONE";
      st.doneAt = new Date().toISOString();
      changed = true;
    }
  }
  const finished = MOCK_STAGES.every((s) => config.stages[s].status === "DONE" || config.stages[s].status === "SKIPPED");
  if (changed || (finished && mock.status === "IN_PROGRESS"))
    await db.examAttempt.update({
      where: { id: mockId },
      data: { config: config as unknown as Prisma.InputJsonValue, status: finished ? "SCORING" : "IN_PROGRESS" },
    });
  if (finished) await finalizeMock(mockId);
}

/** El worker revisa simulacros abiertos (secciones vencidas y calificaciones listas). */
export async function syncOpenMocks(): Promise<number> {
  const open = await db.examAttempt.findMany({ where: { mode: "MOCK", status: { in: ["IN_PROGRESS", "SCORING"] } }, select: { id: true }, take: 100 });
  for (const m of open) await syncMock(m.id);
  return open.length;
}

/* ───────────────────────── informe ───────────────────────── */

export interface MockModule {
  section: MockStage;
  name: string;
  value: number;
  label: string;
  pass?: boolean;
}

export interface MockScores {
  /** aleman: un resultado por modulo/seccion en la escala del examen */
  modules?: MockModule[];
  /** Goethe: los cuatro modulos aprobados (equivale al certificado completo) */
  certificate?: boolean;
  listening: { correct: number; total: number; band: number } | null;
  reading: { correct: number; total: number; band: number } | null;
  writing: { task1: number | null; task2: number | null; band: number } | null;
  speaking: { band: number; criteria: Record<string, number> } | null;
  overall: number | null;
  cefr: string | null;
}

const NarrativeSchema = z.object({
  narrativeEs: z.string().min(40),
  improvements: z.array(z.object({ titleEs: z.string(), detailEs: z.string() })).min(1).max(5),
});

async function finalizeMock(mockId: string) {
  const mock = await db.examAttempt.findUniqueOrThrow({ where: { id: mockId }, include: { user: true, report: true } });
  if (mock.report || mock.status === "COMPLETED") return;
  const config = mock.config as unknown as MockConfig;
  const childIds = MOCK_STAGES.flatMap((s) => config.stages[s].attemptIds);
  const children = await db.examAttempt.findMany({ where: { id: { in: childIds } }, include: { sections: true, writing: true, speaking: true } });
  // Writing y Speaking deben estar calificados (o fallidos) antes del informe.
  if (children.some((c) => c.status === "SCORING" || c.status === "IN_PROGRESS")) return;

  const cfg = await getConfig();
  const byId = (id?: string) => children.find((c) => c.id === id);
  if (mock.exam !== "IELTS_ACADEMIC") {
    const spec = examSpec(mock.exam);
    const modules: MockModule[] = [];
    for (const stage of stageOrder(mock.exam)) {
      const st = config.stages[stage];
      const name = sectionSpec(mock.exam, stage).name;
      if (st.status === "SKIPPED") continue;
      const kids = st.attemptIds.map((id) => byId(id)).filter(Boolean);
      if (stage === "LISTENING" || stage === "READING") {
        const sc = (kids[0]?.scores as unknown as PracticeScores | null)?.scale;
        if (sc) modules.push({ section: stage, name, value: sc.value, label: sc.label, pass: sc.pass });
      } else if (stage === "WRITING") {
        // Puntos del modulo: tareas ponderadas por su tiempo, como en el examen.
        const parts = sectionSpec(mock.exam, "WRITING").parts;
        let sum = 0;
        let weight = 0;
        for (const k of kids) {
          const sub = k!.writing[0];
          const minutes = parts.find((p) => p.part === sub?.taskNumber)?.minutes ?? 1;
          if (sub?.finalScore !== null && sub?.finalScore !== undefined) {
            sum += sub.finalScore * minutes;
            weight += minutes;
          }
        }
        if (weight) {
          const value = Math.round((sum / weight) * 10) / 10;
          const pass = mock.exam === "TESTDAF" ? undefined : value >= 60;
          modules.push({ section: stage, name, value, label: mock.exam === "TESTDAF" ? `${value}/20` : `${Math.round(value)} puntos`, pass });
        }
      } else {
        const sc = (kids[0]?.scores as { scale?: { value: number; label: string; pass?: boolean } } | null)?.scale;
        if (sc) modules.push({ section: stage, name, value: sc.value, label: sc.label, pass: sc.pass });
      }
    }
    const scores: MockScores = {
      modules,
      certificate: mock.exam !== "TESTDAF" && modules.length === 4 && modules.every((m) => m.pass),
      listening: null,
      reading: null,
      writing: null,
      speaking: null,
      overall: null,
      cefr: spec.cefr === "ALL" ? null : spec.cefr,
    };
    return finishReport(mock, config, children, scores);
  }
  const objective = (stage: "LISTENING" | "READING") => {
    const c = byId(config.stages[stage].attemptIds[0]);
    const sc = c?.scores as unknown as PracticeScores | null;
    return sc && sc.band !== null ? { correct: sc.correct, total: sc.total, band: sc.band } : null;
  };
  const listening = objective("LISTENING");
  const reading = objective("READING");
  const [w1, w2] = config.stages.WRITING.attemptIds.map((id) => byId(id));
  const t1 = w1?.writing[0]?.finalScore ?? null;
  const t2 = w2?.writing[0]?.finalScore ?? null;
  const writing = t1 !== null || t2 !== null ? { task1: t1, task2: t2, band: ieltsWritingBand(t1 ?? 0, t2 ?? 0, cfg["exam.writing.task2Weight"]) } : null;
  const sp = byId(config.stages.SPEAKING.attemptIds[0]);
  const spScores = sp?.status === "COMPLETED" ? (sp.scores as { band: number; criteria: Record<string, number> }) : null;
  const speaking = spScores ? { band: spScores.band, criteria: spScores.criteria } : null;
  const overall =
    listening && reading && writing && speaking ? ieltsOverall({ listening: listening.band, reading: reading.band, writing: writing.band, speaking: speaking.band }) : null;
  const scores: MockScores = { listening, reading, writing, speaking, overall, cefr: overall !== null ? ieltsToCefr(overall) : null };
  return finishReport(mock, config, children, scores);
}

type Child = Awaited<ReturnType<typeof db.examAttempt.findMany<{ include: { sections: true; writing: true; speaking: true } }>>>[number];

async function finishReport(
  mock: { id: string; userId: string; exam: ExamCode; user: { email: string; name: string } },
  config: MockConfig,
  children: Child[],
  scores: MockScores,
) {
  const mockId = mock.id;
  const byId = (id?: string) => children.find((c) => c.id === id);
  const overall = scores.overall;

  // Fortalezas y debilidades por tipo de pregunta y por criterio.
  const typeStats: Record<string, { correct: number; total: number }> = {};
  for (const stage of ["LISTENING", "READING"] as const) {
    const sc = byId(config.stages[stage].attemptIds[0])?.scores as unknown as PracticeScores | null;
    for (const [t, v] of Object.entries(sc?.byTaskType ?? {})) {
      const k = `${stage}:${t}`;
      typeStats[k] = { correct: (typeStats[k]?.correct ?? 0) + v.correct, total: (typeStats[k]?.total ?? 0) + v.total };
    }
  }
  const ranked = Object.entries(typeStats)
    .filter(([, v]) => v.total >= 3)
    .map(([k, v]) => ({ key: k, rate: v.correct / v.total, ...v }))
    .sort((a, b) => b.rate - a.rate);
  const strengths = ranked.slice(0, 3);
  const weaknesses = [...ranked].reverse().slice(0, 3);
  const writingCriteria = config.stages.WRITING.attemptIds.map((id) => byId(id)).flatMap((w) => {
    const f = w?.writing[0]?.feedback as unknown as WritingFeedback | null;
    return f ? Object.entries(f.criteria).map(([c, v]) => ({ c, band: v.band })) : [];
  });
  const timing = stageOrder(mock.exam).map((s) => {
    const st = config.stages[s];
    const kids = st.attemptIds.map((id) => byId(id));
    return {
      stage: s,
      status: st.status,
      minutes: st.startedAt && st.doneAt ? Math.round((new Date(st.doneAt).getTime() - new Date(st.startedAt).getTime()) / 60_000) : null,
      unanswered: null as number | null,
      tabSwitches: kids.reduce((n, k) => n + (k?.sections.reduce((m, x) => m + x.tabSwitches, 0) ?? 0), 0),
    };
  });
  const unanswered = await db.examResponse.groupBy({
    by: ["attemptId"],
    where: { attemptId: { in: [config.stages.LISTENING.attemptIds[0], config.stages.READING.attemptIds[0]].filter(Boolean) as string[] }, answer: { equals: { value: "" } } },
    _count: true,
  });
  for (const t of timing)
    if (t.stage === "LISTENING" || t.stage === "READING")
      t.unanswered = unanswered.find((u) => u.attemptId === config.stages[t.stage].attemptIds[0])?._count ?? 0;

  let narrative = "";
  let improvements: { titleEs: string; detailEs: string }[] = [];
  try {
    const r = await ai().generateJson({
      purpose: "report.narrative",
      modelKey: "ai.model.judge",
      system:
        "Eres un tutor experto en IELTS que escribe para hispanohablantes. Redacta en español claro, con tildes, cálido y concreto. No inventes datos: usa solo los números dados. Recuerda que es una estimación, no una nota oficial.",
      prompt: `Resultados del simulacro ${examSpec(mock.exam).name}: ${JSON.stringify(scores)}\nTipos de pregunta (aciertos/total): ${JSON.stringify(typeStats)}\nCriterios de Writing: ${JSON.stringify(writingCriteria)}\nTiempo y foco: ${JSON.stringify(timing)}\nEscribe narrativeEs (un párrafo de 4–6 oraciones) y 3–5 mejoras priorizadas (titleEs corto + detailEs con qué practicar en MyPAL).`,
      schema: NarrativeSchema,
      temperature: 0.4,
      userId: mock.userId,
      refId: mockId,
    });
    narrative = r.data.narrativeEs;
    improvements = r.data.improvements;
  } catch {
    narrative = "Tu informe está listo. Revisa cada sección y empieza por los tipos de pregunta con menos aciertos.";
    improvements = weaknesses.map((w) => ({ titleEs: w.key.split(":")[1].replaceAll("_", " ").toLowerCase(), detailEs: `Acertaste ${w.correct} de ${w.total}.` }));
  }

  await db.$transaction([
    db.examReport.create({
      data: {
        attemptId: mockId,
        strengths: strengths as unknown as Prisma.InputJsonValue,
        weaknesses: weaknesses as unknown as Prisma.InputJsonValue,
        timing: timing as unknown as Prisma.InputJsonValue,
        narrative,
        improvements: improvements as unknown as Prisma.InputJsonValue,
      },
    }),
    db.examAttempt.update({
      where: { id: mockId },
      data: { status: "COMPLETED", completedAt: new Date(), scores: scores as unknown as Prisma.InputJsonValue, overall },
    }),
  ]);
  // Si el simulacro no llego a empezar el Listening, el cupo reservado se devuelve.
  await releaseQuota({ userId: mock.userId, kind: "MOCK", refId: mockId });
  // El simulacro cuenta en el plan y su informe se convierte en tareas de mejora.
  await markPlanProgress(mock.userId, mock.exam, { kind: "MOCK" }).catch(() => undefined);
  await addMockImprovements(mockId).catch((err) => console.error("[mock] plan de mejora", err));

  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/app/examenes/simulacro/${mockId}`;
  const band =
    overall !== null ? `banda ${overall.toFixed(1)}` : scores.modules?.length ? scores.modules.map((m) => `${m.name}: ${m.label}`).join(" · ") : "tu informe por secciones";
  await sendEmail(examReportEmail(mock.user.email, mock.user.name, examSpec(mock.exam).name, band, url)).catch(() => undefined);
}

/* ───────────────────────── vista ───────────────────────── */

export async function mockView(mockId: string, userId: string) {
  await syncMock(mockId);
  const { mock, config } = await loadMock(mockId, userId);
  const report = await db.examReport.findUnique({ where: { attemptId: mockId } });
  const spec = examSpec(mock.exam);
  return {
    mock,
    config,
    report,
    scores: mock.scores as unknown as MockScores | null,
    stages: stageOrder(mock.exam).map((s) => {
      const section = spec.sections.find((x) => x.section === s)!;
      const st = config.stages[s];
      return {
        stage: s,
        name: section.name,
        minutes: section.minutes + (section.reviewMinutes ?? 0),
        status: st.status,
        url: st.status === "ACTIVE" ? stageUrl(mockId, s, st.attemptIds) : null,
      };
    }),
  };
}

/** Si un intento hijo pertenece a un simulacro, su id (para volver a el). */
export function mockIdOf(config: unknown): string | null {
  return (config as { mockId?: string } | null)?.mockId ?? null;
}
