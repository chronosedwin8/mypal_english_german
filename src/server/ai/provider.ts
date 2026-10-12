/**
 * Interfaz unica para modelos de lenguaje. Hoy: Gemini (Google) y un simulador.
 * Permite enviar ciertas cuentas (p. ej. menores en instituciones) a otro proveedor
 * sin tocar el resto del sistema.
 */
import type { z } from "zod";

export type AiPurpose =
  | "bank.generate"
  | "bank.repair"
  | "bank.solve"
  | "bank.judge"
  | "writing.grade"
  | "speaking.grade"
  | "speaking.examiner"
  | "report.narrative"
  | "health";

export interface AiCallOptions<T> {
  purpose: AiPurpose;
  /** clave de configuracion del modelo, p. ej. "ai.model.generate" */
  modelKey: "ai.model.generate" | "ai.model.grade" | "ai.model.solve" | "ai.model.judge" | "ai.model.examiner";
  system?: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  maxOutputTokens?: number;
  userId?: string | null;
  refId?: string | null;
  /** audio adjunto (para calificar pronunciacion escuchando) */
  audio?: { data: Buffer; mimeType: string };
}

export interface AiResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: bigint;
}

export interface AiProvider {
  readonly id: "gemini" | "fake";
  generateJson<T>(opts: AiCallOptions<T>): Promise<AiResult<T>>;
}

export class AiError extends Error {
  constructor(
    readonly code: "NOT_CONFIGURED" | "BUDGET_EXCEEDED" | "INVALID_OUTPUT" | "PROVIDER_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}
