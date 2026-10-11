"use server";

import { z } from "zod";

import { requireUser } from "@/server/auth/dal";
import { reviewVocabulary } from "@/server/learning/vocabulary";

const Input = z.object({ id: z.string().min(1).max(64), grade: z.enum(["again", "hard", "good", "easy"]) });

export async function reviewWord(id: string, grade: "again" | "hard" | "good" | "easy") {
  const user = await requireUser();
  const parsed = Input.parse({ id, grade });
  await reviewVocabulary(user.id, parsed.id, parsed.grade);
  return { ok: true };
}
