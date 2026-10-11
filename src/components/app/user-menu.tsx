import { getCurrentUser } from "@/server/auth/dal";

import { UserMenuClient } from "./user-menu-client";

export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <UserMenuClient name={user.name} email={user.email} isAdmin={user.role === "ADMIN"} />;
}
