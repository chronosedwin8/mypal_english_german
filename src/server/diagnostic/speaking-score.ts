/**
 * Puntuacion de las tareas de habla a partir de la transcripcion (puro).
 *  - Lectura en voz alta: precision de palabras frente a la frase de referencia.
 *  - Respuesta abierta: fluidez (palabras/min) y variedad de vocabulario.
 * Si el idioma detectado no es el esperado, la puntuacion se reduce a la mitad.
 */
import type { CefrLevel } from "@/content/diagnostic/types";

export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Distancia de edicion entre secuencias de palabras. */
export function wordEditDistance(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function scoreReadAloud(input: {
  reference: string;
  transcript: string;
  languageMatches: boolean;
}): { accuracy: number; score: number } {
  const ref = normalizeWords(input.reference);
  const hyp = normalizeWords(input.transcript);
  if (!ref.length || !hyp.length) return { accuracy: 0, score: 0 };
  const accuracy = clamp01(1 - wordEditDistance(ref, hyp) / ref.length);
  return { accuracy, score: accuracy * (input.languageMatches ? 1 : 0.5) };
}

export function scoreOpenAnswer(input: {
  transcript: string;
  durationMs: number;
  languageMatches: boolean;
}): { wordsPerMinute: number; uniqueWords: number; score: number } {
  const words = normalizeWords(input.transcript);
  const uniqueWords = new Set(words).size;
  const minutes = Math.max(input.durationMs, 3000) / 60000;
  const wordsPerMinute = words.length / minutes;
  const fluency = clamp01(wordsPerMinute / 110);
  const lexical = clamp01(uniqueWords / 35);
  const score = (0.5 * fluency + 0.5 * lexical) * (input.languageMatches ? 1 : 0.5);
  return { wordsPerMinute, uniqueWords, score };
}

/** Nivel orientativo de expresion oral segun la puntuacion media (0..1). */
export function speakingLevel(score: number): CefrLevel {
  if (score < 0.25) return "A1";
  if (score < 0.45) return "A2";
  if (score < 0.65) return "B1";
  if (score < 0.8) return "B2";
  return "C1";
}
