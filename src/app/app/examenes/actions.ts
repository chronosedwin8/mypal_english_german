"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { EXAM_CODES } from "@/content/exams";
import { requireUser } from "@/server/auth/dal";
import { PracticeError, audioUrl, recordTabSwitch, saveAnswer, startPractice, submitPractice } from "@/server/exams/practice";

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
  if (err instanceof PracticeError) return { ok: false, error: err.message };
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
  redirect(`/app/examenes/resultado/${attemptId}`);
}
