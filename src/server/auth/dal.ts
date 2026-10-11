/**
 * Capa de acceso a datos de sesion (DAL). Toda pagina, Server Action y ruta API
 * protegida pasa por aqui; el proxy solo hace redirecciones de conveniencia.
 */
import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "./auth";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: "STUDENT" | "ADMIN";
  emailVerified: boolean;
}

function toCurrentUser(user: { id: string; name: string; email: string; emailVerified: boolean; role?: unknown }): CurrentUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role === "ADMIN" ? "ADMIN" : "STUDENT",
  };
}

/** Usuario de la peticion actual (una sola lectura por render). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session ? toCurrentUser(session.user) : null;
});

export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/ingresar?next=${encodeURIComponent(next)}` : "/ingresar");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/app");
  return user;
}

/** Para rutas API: devuelve el usuario o null (sin redirigir). */
export async function getUserFromRequest(request: Request): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session ? toCurrentUser(session.user) : null;
}
