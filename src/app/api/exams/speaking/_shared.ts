import { getUserFromRequest } from "@/server/auth/dal";
import { SpeakingError } from "@/server/exams/speaking";
import { HttpError } from "@/server/http";

export async function speakingUser(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Inicia sesión para continuar.");
  return user;
}

export function toHttp(err: unknown) {
  if (err instanceof SpeakingError) {
    const status = err.code === "NOT_FOUND" ? 404 : err.code === "NO_ACCESS" ? 403 : err.code === "BAD_AUDIO" ? 400 : 409;
    return new HttpError(status, err.code, err.message);
  }
  return err;
}
