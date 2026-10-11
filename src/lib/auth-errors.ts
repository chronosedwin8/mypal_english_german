/** Mensajes en español para los codigos de error de Better Auth. */
const MESSAGES: Record<string, string> = {
  USER_ALREADY_EXISTS: "Ya existe una cuenta con este correo. Intenta ingresar.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Ya existe una cuenta con este correo. Intenta ingresar.",
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos.",
  INVALID_EMAIL: "Revisa el correo: no parece válido.",
  INVALID_PASSWORD: "Contraseña incorrecta.",
  EMAIL_NOT_VERIFIED: "Aún no confirmas tu correo. Te enviamos un nuevo enlace.",
  PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 8 caracteres.",
  PASSWORD_TOO_LONG: "La contraseña es demasiado larga.",
  INVALID_TOKEN: "El enlace no es válido o ya caducó. Pide uno nuevo.",
  TOKEN_EXPIRED: "El enlace caducó. Pide uno nuevo.",
  VERIFICATION_FAILED: "No pudimos verificar que eres humano. Recarga la página e inténtalo de nuevo.",
  MISSING_RESPONSE: "Completa la verificación de seguridad.",
};

export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!error) return "Ocurrió un error inesperado.";
  if (error.status === 429) return "Demasiados intentos. Espera un momento y vuelve a intentarlo.";
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  return "No pudimos completar la acción. Inténtalo de nuevo.";
}

/** Solo rutas internas como destino tras ingresar (evita redirecciones abiertas). */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
