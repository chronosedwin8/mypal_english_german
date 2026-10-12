import { FakeAiProvider } from "./fake";
import { GeminiProvider } from "./gemini";
import type { AiProvider } from "./provider";

export * from "./provider";

let cached: AiProvider | null = null;

/** AI_DRIVER=gemini (por defecto) | fake (tests, sin costo). */
export function ai(): AiProvider {
  const driver = process.env.AI_DRIVER === "fake" ? "fake" : "gemini";
  if (!cached || cached.id !== driver) cached = driver === "fake" ? new FakeAiProvider() : new GeminiProvider();
  return cached;
}
