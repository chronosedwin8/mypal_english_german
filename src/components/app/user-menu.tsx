import { getCurrentUser } from "@/server/auth/dal";
import { db } from "@/server/db";

import { UserMenuClient } from "./user-menu-client";

export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  const roles = await db.orgMember.findMany({ where: { userId: user.id, status: "ACTIVE", role: { in: ["TEACHER", "ORG_ADMIN"] } }, select: { role: true } });
  return (
    <UserMenuClient
      name={user.name}
      email={user.email}
      isAdmin={user.role === "ADMIN" || user.role === "SUPPORT"}
      isTeacher={roles.length > 0}
      isOrgAdmin={roles.some((r) => r.role === "ORG_ADMIN")}
    />
  );
}
