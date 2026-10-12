"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { EXAMS, EXAM_CODES } from "@/content/exams";
import { REPORT_REASONS, type ReportReason } from "@/lib/exams/report-reasons";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { QuotaError } from "@/server/exams/entitlements";
import { MOCK_STAGES, MockError, mockIdOf, skipMockSpeaking, startMock, startMockStage, submitMockWriting, syncMock } from "@/server/exams/mock";
import { PracticeError, audioUrl, recordTabSwitch, saveAnswer, startPractice, submitPractice } from "@/server/exams/practice";
import { ReportError, reportQuestion } from "@/server/exams/reports";
import { SpeakingError, startSpeaking, type SpeakingPart } from "@/server/exams/speaking";
import { WritingError, saveWritingDraft, startWriting, submitWriting } from "@/server/exams/writing";
import { assignmentForStudent } from "@/server/org/teaching";
import { savePlan, setItemStatus } from "@/server/study/plan";

const StartSchema = z.object({
  exam: z.enum(EXAM_CODES as [string, ...string[]]),
  mode: z.enum(["DRILL", "PART", "SECTION"]),
  section: z.enum(["LISTENING", "READING"]),
  part: z.coerce.number().int().min(1).max(10).optional(),
  taskType: z.string().max(40).optional(),
});

export async function startPracticeAction(formData: FormData) {
  const user = await requireUser("/app/examenes");
  const input = StartSchema.parse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  let attemptId: string;
  try {
    ({ attemptId } = await startPractice(user, { ...input, exam: input.exam as never }));
  } catch (err) {
    if (err instanceof PracticeError) redirect(`/app/examenes?aviso=${encodeURIComponent(err.message)}`);
    throw err;
  }
  redirect(`/app/examenes/practica/${attemptId}`);
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function failure(err: unknown): { ok: false; error: string } {
  if (err instanceof PracticeError || err instanceof WritingError) return { ok: false, error: err.message };
  if (err instanceof QuotaError) return { ok: false, error: "No te quedan correcciones de Writing en tu plan." };
  console.error("[examenes]", err);
  return { ok: false, error: "No pudimos guardar. Revisa tu conexión." };
}

export async function saveAnswerAction(attemptId: string, itemSetId: string, questionId: string, value: string, timeMs?: number): Promise<Result> {
  const user = await requireUser();
  try {
    await saveAnswer(attemptId, user.id, itemSetId, questionId, String(value), timeMs);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function audioUrlAction(attemptId: string, itemSetId: string, index: number): Promise<Result<{ url: string }>> {
  const user = await requireUser();
  try {
    return { ok: true, url: await audioUrl(attemptId, user.id, itemSetId, index) };
  } catch (err) {
    return failure(err);
  }
}

export async function tabSwitchAction(attemptId: string) {
  const user = await requireUser();
  await recordTabSwitch(attemptId, user.id);
}

export async function submitPracticeAction(attemptId: string) {
  const user = await requireUser();
  await submitPractice(attemptId, user.id);
  const attempt = await db.examAttempt.findFirst({ where: { id: attemptId, userId: user.id }, select: { config: true } });
  const mockId = mockIdOf(attempt?.config);
  if (mockId) {
    await syncMock(mockId);
    redirect(`/app/examenes/simulacro/${mockId}`);
  }
  redirect(`/app/examenes/resultado/${attemptId}`);
}

/* ───────────── Writing ───────────── */

export async function startWritingAction(formData: FormData) {
  const user = await requireUser("/app/examenes");
  const input = z
    .object({ exam: z.enum(EXAM_CODES as [string, ...string[]]), task: z.coerce.number().int().min(1).max(3), timed: z.string().optional() })
    .parse(Object.fromEntries(formData));
  let attemptId: string;
  try {
    ({ attemptId } = await startWriting(user, { exam: input.exam as never, task: input.task, timed: input.timed === "on" }));
  } catch (err) {
    if (err instanceof WritingError) redirect(`/app/examenes?examen=${input.exam}&aviso=${encodeURIComponent(err.message)}`);
    throw err;
  }
  redirect(`/app/examenes/writing/${attemptId}`);
}

export async function saveWritingDraftAction(attemptId: string, text: string): Promise<Result> {
  const user = await requireUser();
  try {
    await saveWritingDraft(attemptId, user.id, String(text));
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function submitWritingAction(attemptId: string, text: string): Promise<Result> {
  const user = await requireUser();
  try {
    await submitWriting(attemptId, user, String(text));
  } catch (err) {
    return failure(err);
  }
  redirect(`/app/examenes/writing/${attemptId}`);
}

/* ───────────── Speaking ───────────── */

export async function startSpeakingAction(formData: FormData) {
  const user = await requireUser("/app/examenes");
  const input = z
    .object({ exam: z.enum(EXAM_CODES as [string, ...string[]]), parts: z.union([z.literal("all"), z.string().regex(/^[1-9]$/)]) })
    .parse(Object.fromEntries(formData));
  const allParts = EXAMS[input.exam as keyof typeof EXAMS].sections.find((s) => s.section === "SPEAKING")!.parts.map((p) => p.part);
  if (input.parts !== "all" && !allParts.includes(Number(input.parts))) throw new Error("Parte desconocida");
  const parts: SpeakingPart[] = input.parts === "all" ? allParts : [Number(input.parts)];
  let attemptId: string;
  try {
    ({ attemptId } = await startSpeaking(user, { exam: input.exam as never, parts }));
  } catch (err) {
    if (err instanceof SpeakingError) redirect(`/app/examenes?examen=${input.exam}&aviso=${encodeURIComponent(err.message)}`);
    if (err instanceof QuotaError) redirect(`/app/examenes?examen=${input.exam}&aviso=${encodeURIComponent("No te quedan partes de Speaking en tu plan.")}`);
    throw err;
  }
  redirect(`/app/examenes/speaking/${attemptId}`);
}

/* ───────────── Simulacro completo ───────────── */

export async function startMockAction(formData: FormData) {
  const user = await requireUser("/app/examenes");
  const exam = z.enum(EXAM_CODES as [string, ...string[]]).parse(formData.get("exam"));
  let mockId: string;
  try {
    ({ mockId } = await startMock(user, exam as never));
  } catch (err) {
    if (err instanceof MockError) redirect(`/app/examenes?examen=${exam}&aviso=${encodeURIComponent(err.message)}`);
    if (err instanceof QuotaError) redirect(`/app/examenes?examen=${exam}&aviso=${encodeURIComponent("No te quedan simulacros en tu plan.")}`);
    throw err;
  }
  redirect(`/app/examenes/simulacro/${mockId}`);
}

export async function startMockStageAction(formData: FormData) {
  const user = await requireUser("/app/examenes");
  const input = z.object({ mockId: z.string().min(1), stage: z.enum(MOCK_STAGES) }).parse(Object.fromEntries(formData));
  let url: string;
  try {
    url = await startMockStage(input.mockId, user, input.stage);
  } catch (err) {
    if (err instanceof MockError) redirect(`/app/examenes/simulacro/${input.mockId}?aviso=${encodeURIComponent(err.message)}`);
    throw err;
  }
  redirect(url);
}

export async function skipMockSpeakingAction(formData: FormData) {
  const user = await requireUser("/app/examenes");
  const mockId = z.string().min(1).parse(formData.get("mockId"));
  await skipMockSpeaking(mockId, user.id);
  redirect(`/app/examenes/simulacro/${mockId}`);
}

export async function submitMockWritingAction(mockId: string, texts: Record<string, string>): Promise<Result> {
  const user = await requireUser();
  try {
    await submitMockWriting(mockId, user, texts);
  } catch (err) {
    return failure(err);
  }
  redirect(`/app/examenes/simulacro/${mockId}`);
}

/* ───────────── Plan de estudios y progreso ───────────── */

const band = z.coerce.number().min(1).max(9).multipleOf(0.5);

export async function savePlanAction(formData: FormData) {
  const user = await requireUser("/app/examenes/plan");
  const input = z
    .object({
      exam: z.enum(EXAM_CODES as [string, ...string[]]),
      target: band,
      examDate: z.string().optional(),
      hoursPerWeek: z.coerce.number().int().min(1).max(40),
    })
    .parse(Object.fromEntries(formData));
  const days = formData.getAll("days").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const examDate = input.examDate ? new Date(`${input.examDate}T09:00:00Z`) : null;
  if (examDate && (Number.isNaN(examDate.getTime()) || examDate.getTime() < Date.now()))
    redirect(`/app/examenes/plan?aviso=${encodeURIComponent("La fecha del examen debe ser futura.")}`);
  await savePlan(user, { exam: input.exam as never, targets: { overall: input.target }, examDate, hoursPerWeek: input.hoursPerWeek, days: days.length ? days : [1, 3, 5] });
  redirect("/app/examenes/plan");
}

export async function setPlanItemAction(formData: FormData) {
  const user = await requireUser("/app/examenes/plan");
  const input = z.object({ itemId: z.string().min(1), status: z.enum(["TODO", "DONE", "SKIPPED"]) }).parse(Object.fromEntries(formData));
  await setItemStatus(input.itemId, user.id, input.status);
  revalidatePath("/app/examenes/plan");
}

export async function officialResultAction(formData: FormData) {
  const user = await requireUser("/app/examenes/progreso");
  const input = z
    .object({
      exam: z.enum(EXAM_CODES as [string, ...string[]]),
      takenAt: z.string().min(8),
      overall: band,
      listening: band,
      reading: band,
      writing: band,
      speaking: band,
    })
    .parse(Object.fromEntries(formData));
  const takenAt = new Date(`${input.takenAt}T12:00:00Z`);
  if (Number.isNaN(takenAt.getTime()) || takenAt.getTime() > Date.now()) redirect(`/app/examenes/progreso?aviso=${encodeURIComponent("Revisa la fecha del examen.")}`);
  await db.officialResult.create({
    data: {
      userId: user.id,
      exam: input.exam as never,
      takenAt,
      scores: { overall: input.overall, listening: input.listening, reading: input.reading, writing: input.writing, speaking: input.speaking },
    },
  });
  redirect("/app/examenes/progreso?aviso=" + encodeURIComponent("¡Gracias! Usamos tu nota oficial para afinar el simulador."));
}

/* ───────────── Tareas del docente ───────────── */

export async function startAssignmentAction(formData: FormData) {
  const user = await requireUser("/app/examenes");
  const assignmentId = z.string().min(1).parse(formData.get("assignmentId"));
  let url = "/app/examenes";
  try {
    const a = await assignmentForStudent(assignmentId, user.id);
    const cfg = a.config as { exam: string; mode?: "DRILL" | "PART" | "SECTION"; section?: "LISTENING" | "READING"; taskType?: string | null; part?: number | null; task?: number; parts?: number[] | "all" };
    const exam = cfg.exam as never;
    if (a.kind === "PRACTICE") {
      const r = await startPractice(user, { exam, mode: cfg.mode ?? "PART", section: cfg.section ?? "READING", part: cfg.part ?? (cfg.mode === "PART" ? 1 : null), taskType: cfg.taskType ?? null, assignmentId });
      url = `/app/examenes/practica/${r.attemptId}`;
    } else if (a.kind === "WRITING") {
      const r = await startWriting(user, { exam, task: cfg.task ?? 1, timed: true, assignmentId });
      url = `/app/examenes/writing/${r.attemptId}`;
    } else if (a.kind === "SPEAKING") {
      const all = EXAMS[cfg.exam as keyof typeof EXAMS].sections.find((s) => s.section === "SPEAKING")!.parts.map((p) => p.part);
      const r = await startSpeaking(user, { exam, parts: cfg.parts === "all" || !cfg.parts ? all : cfg.parts, assignmentId });
      url = `/app/examenes/speaking/${r.attemptId}`;
    } else {
      const r = await startMock(user, exam, { formId: a.formId ?? undefined, assignmentId });
      url = `/app/examenes/simulacro/${r.mockId}`;
    }
  } catch (err) {
    const message = err instanceof QuotaError ? "No te quedan cupos para esta tarea. Avísale a tu docente." : err instanceof Error && "code" in err ? err.message : null;
    if (message) redirect(`/app/examenes?aviso=${encodeURIComponent(message)}`);
    throw err;
  }
  redirect(url);
}

const ReportSchema = z.object({
  attemptId: z.string().min(1),
  itemSetId: z.string().min(1),
  questionNumber: z.number().int().min(1).max(200),
  reason: z.enum(Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]]),
  note: z.string().trim().max(500).optional(),
});

export async function reportQuestionAction(input: z.input<typeof ReportSchema>): Promise<Result> {
  const user = await requireUser("/app/examenes");
  const parsed = ReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa el motivo del reporte." };
  try {
    await reportQuestion(user.id, parsed.data);
    return { ok: true };
  } catch (err) {
    if (err instanceof ReportError) return { ok: false, error: err.message };
    throw err;
  }
}
