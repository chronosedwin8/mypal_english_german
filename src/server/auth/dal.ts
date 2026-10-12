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
  role: "STUDENT" | "SUPPORT" | "ADMIN";
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

function toCurrentUser(user: { id: string; name: string; email: string; emailVerified: boolean; role?: unknown; twoFactorEnabled?: unknown }): CurrentUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role === "ADMIN" ? "ADMIN" : user.role === "SUPPORT" ? "SUPPORT" : "STUDENT",
    twoFactorEnabled: user.twoFactorEnabled === true,
  };
}

/** Segundo factor obligatorio para el equipo (por defecto solo en produccion). */
export function require2fa(): boolean {
  const v = process.env.ADMIN_REQUIRE_2FA?.trim();
  return v ? v === "true" : process.env.NODE_ENV === "production";
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

/** Administrador: puede leer y cambiar todo. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect(user.role === "SUPPORT" ? "/admin?aviso=solo-lectura" : "/app");
  if (require2fa() && !user.twoFactorEnabled) redirect("/app/seguridad?motivo=admin");
  return user;
}

/** Equipo (administrador o soporte): lectura del panel de administracion. */
export async function requireStaff(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "SUPPORT") redirect("/app");
  if (require2fa() && !user.twoFactorEnabled) redirect("/app/seguridad?motivo=admin");
  return user;
}

/** Para rutas API: devuelve el usuario o null (sin redirigir). */
export async function getUserFromRequest(request: Request): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session ? toCurrentUser(session.user) : null;
}
