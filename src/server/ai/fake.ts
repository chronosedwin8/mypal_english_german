/**
 * Simulador de IA (AI_DRIVER=fake): respuestas fijas por proposito, costo $0.
 * Los tests registran respuestas con `fakeAi.respond(purpose, fn)`.
 */
import { AiError, type AiCallOptions, type AiProvider, type AiPurpose, type AiResult } from "./provider";

type Responder = (opts: AiCallOptions<unknown>) => unknown;

const g = globalThis as unknown as { __fakeAi?: Map<AiPurpose, Responder> };

function registry() {
  if (!g.__fakeAi) g.__fakeAi = new Map();
  return g.__fakeAi;
}

export const fakeAi = {
  respond(purpose: AiPurpose, fn: Responder) {
    registry().set(purpose, fn);
  },
  reset() {
    registry().clear();
  },
};

export class FakeAiProvider implements AiProvider {
  readonly id = "fake" as const;

  async generateJson<T>(opts: AiCallOptions<T>): Promise<AiResult<T>> {
    const fn = registry().get(opts.purpose);
    if (!fn) throw new AiError("NOT_CONFIGURED", `El simulador de IA no tiene respuesta para ${opts.purpose}`);
    const parsed = opts.schema.safeParse(fn(opts as AiCallOptions<unknown>));
    if (!parsed.success) throw new AiError("INVALID_OUTPUT", parsed.error.message);
    return { data: parsed.data, model: "fake", inputTokens: 0, outputTokens: 0, costMicroUsd: BigInt(0) };
  }
}
