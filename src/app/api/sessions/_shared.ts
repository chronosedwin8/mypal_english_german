import { HttpError } from "@/server/http";
import { SessionError } from "@/server/sessions/errors";

export function toHttp(err: unknown): unknown {
  return err instanceof SessionError ? new HttpError(err.status, err.code, err.message) : err;
}
