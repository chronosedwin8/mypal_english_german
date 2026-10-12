"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { OrgError, createInvitation } from "@/server/org";
import { addTeacherReview, createAssignment, requireGroupAccess } from "@/server/org/teaching";

function back(path: string, aviso?: string): never {
  revalidatePath(path);
  redirect(`${path}${aviso ? `?aviso=${encodeURIComponent(aviso)}` : ""}`);
}

export async function createAssignmentAction(formData: FormData) {
  const user = await requireUser("/docente");
  const input = z
    .object({
      groupId: z.string(),
      kind: z.enum(["PRACTICE", "WRITING", "SPEAKING", "MOCK"]),
      title: z.string().trim().min(3).max(120),
      mode: z.enum(["DRILL", "PART", "SECTION"]).optional(),
      section: z.enum(["LISTENING", "READING"]).optional(),
      taskType: z.string().max(40).optional(),
      part: z.coerce.number().int().min(1).max(9).optional(),
      opensAt: z.string().min(8),
      closesAt: z.string().min(8),
    })
    .parse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  const { member } = await requireGroupAccess(user, input.groupId);
  const config =
    input.kind === "PRACTICE"
      ? { mode: input.mode ?? "PART", section: input.section ?? "READING", taskType: input.taskType ?? null, part: input.part ?? null }
      : input.kind === "WRITING"
        ? { task: input.part ?? 1 }
        : input.kind === "SPEAKING"
          ? { parts: input.part ? [input.part] : "all" }
          : {};
  try {
    await createAssignment({
      groupId: input.groupId,
      createdBy: member?.id ?? `admin:${user.id}`,
      kind: input.kind,
      title: input.title,
      config,
      opensAt: new Date(input.opensAt),
      closesAt: new Date(input.closesAt),
    });
  } catch (err) {
    if (err instanceof OrgError) back(`/docente/grupo/${input.groupId}`, err.message);
    throw err;
  }
  back(`/docente/grupo/${input.groupId}`, "Tarea asignada al grupo.");
}

export async function groupCodeAction(formData: FormData) {
  const user = await requireUser("/docente");
  const groupId = z.string().parse(formData.get("groupId"));
  const { group } = await requireGroupAccess(user, groupId);
  const inv = await createInvitation({ orgId: group.orgId, role: "STUDENT", groupId, maxUses: 60, days: 14, createdBy: user.id });
  back(`/docente/grupo/${groupId}`, `Código para tus estudiantes: ${inv.code} (vale 14 días, hasta 60 personas)`);
}

export async function reviewAction(formData: FormData) {
  const user = await requireUser("/docente");
  const input = z
    .object({
      kind: z.enum(["WRITING", "SPEAKING"]),
      submissionId: z.string(),
      score: z.coerce.number().min(0).max(100),
      reason: z.string().trim().min(3).max(500),
      comment: z.string().trim().max(2000).optional(),
      back: z.string().startsWith("/docente"),
    })
    .parse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  try {
    await addTeacherReview(user, input);
  } catch (err) {
    if (err instanceof OrgError) back(input.back, err.message);
    throw err;
  }
  back(input.back, "Revisión guardada: tu nota es la que ve el estudiante.");
}

/** El docente apaga o enciende el tutor con avatar para su grupo. */
export async function groupAvatarAction(formData: FormData) {
  const user = await requireUser("/docente");
  const input = z.object({ groupId: z.string(), allowed: z.enum(["true", "false"]) }).parse(Object.fromEntries(formData));
  await requireGroupAccess(user, input.groupId);
  await db.accessRule.upsert({
    where: { scope_scopeId_resource: { scope: "GROUP", scopeId: input.groupId, resource: "tutor.avatar" } },
    create: { scope: "GROUP", scopeId: input.groupId, resource: "tutor.avatar", allowed: input.allowed === "true", reason: "El docente apagó el tutor con avatar para este grupo.", authorId: user.id },
    update: { allowed: input.allowed === "true", authorId: user.id },
  });
  back(`/docente/grupo/${input.groupId}`, input.allowed === "true" ? "Tutor con avatar activado para el grupo." : "Tutor con avatar apagado para el grupo.");
}
