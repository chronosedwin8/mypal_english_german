/** Utilidades para rutas API: respuestas JSON uniformes y errores tipados. */
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Datos inválidos.", issues: err.issues.slice(0, 5) } },
      { status: 400 },
    );
  }
  console.error("[api] error inesperado:", err);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Ocurrió un error inesperado." } }, { status: 500 });
}
