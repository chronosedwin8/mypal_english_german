import { randomUUID } from "node:crypto";

import type { NextResponse } from "next/server";

import { getUserFromRequest } from "@/server/auth/dal";
import { DiagnosticError, type Owner } from "@/server/diagnostic/service";
import { HttpError } from "@/server/http";
import { ANON_COOKIE, readCookie } from "@/server/security";

export async function ownerFrom(request: Request): Promise<Owner & { newAnonId: string | null }> {
  const user = await getUserFromRequest(request);
  const anon = readCookie(request.headers, ANON_COOKIE);
  const newAnonId = !user && !anon ? randomUUID() : null;
  return { userId: user?.id ?? null, anonId: anon ?? newAnonId, newAnonId };
}

export function setAnonCookie(res: NextResponse, anonId: string) {
  res.cookies.set(ANON_COOKIE, anonId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

const STATUS: Record<DiagnosticError["code"], number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  WRONG_PHASE: 409,
  STALE_ITEM: 409,
  SPEAKING_DISABLED: 409,
  BAD_AUDIO: 400,
  STT_FAILED: 502,
};

export function toHttp(err: unknown): unknown {
  return err instanceof DiagnosticError ? new HttpError(STATUS[err.code], err.code, err.message) : err;
}
