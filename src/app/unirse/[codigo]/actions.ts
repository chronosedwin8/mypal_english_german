"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { OrgError, acceptInvitation } from "@/server/org";

export async function acceptInvitationAction(formData: FormData) {
  const input = z
    .object({ code: z.string().min(4).max(20), birthDate: z.string().optional() })
    .parse(Object.fromEntries(formData));
  const user = await requireUser(`/unirse/${input.code}`);
  const birthDate = input.birthDate ? new Date(`${input.birthDate}T00:00:00Z`) : null;
  let memberId: string;
  try {
    memberId = await acceptInvitation({ code: input.code, userId: user.id, email: user.email, birthDate: birthDate && !Number.isNaN(birthDate.getTime()) ? birthDate : null });
  } catch (err) {
    if (err instanceof OrgError) redirect(`/unirse/${input.code}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }
  const member = await db.orgMember.findUniqueOrThrow({ where: { id: memberId } });
  redirect(member.role === "STUDENT" ? "/app/examenes" : member.role === "TEACHER" ? "/docente" : "/institucion");
}
