"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/server/auth/dal";
import { deleteMyRecordings } from "@/server/exams/recordings";

export async function deleteMyRecordingsAction() {
  const user = await requireUser("/app/seguridad");
  const files = await deleteMyRecordings(user.id);
  revalidatePath("/app/seguridad");
  redirect(`/app/seguridad?aviso=${encodeURIComponent(files ? `Borramos ${files} grabaciones. Tus transcripciones y notas se conservan.` : "No tenías grabaciones guardadas.")}`);
}
