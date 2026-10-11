/** Datos de marca en un solo lugar ("MyPAL" es nombre de trabajo). */
export const SITE = {
  name: "MyPAL",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  description:
    "Conversa por video con un tutor de inteligencia artificial que te escucha, corrige con paciencia y ve lo que le muestras. Inglés americano, británico y alemán, desde tu nivel.",
  supportEmail: "soporte@mypal.app",
} as const;

export const LANGUAGES = {
  EN_US: { code: "EN_US", label: "Inglés americano", short: "Inglés (EE. UU.)", flag: "US", locale: "en-US", base: "EN" },
  EN_GB: { code: "EN_GB", label: "Inglés británico", short: "Inglés (Reino Unido)", flag: "GB", locale: "en-GB", base: "EN" },
  DE: { code: "DE", label: "Alemán", short: "Alemán", flag: "DE", locale: "de-DE", base: "DE" },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;
export const LANGUAGE_CODES = Object.keys(LANGUAGES) as LanguageCode[];

export function isLanguageCode(v: unknown): v is LanguageCode {
  return typeof v === "string" && v in LANGUAGES;
}

export const CEFR_LABELS: Record<string, string> = {
  A1: "A1 · Principiante",
  A2: "A2 · Básico",
  B1: "B1 · Intermedio",
  B2: "B2 · Intermedio alto",
  C1: "C1 · Avanzado",
  C2: "C2 · Maestría",
};
