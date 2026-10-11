import type { CefrLevel } from "./types";

export type SpeakingKind = "READ_ALOUD" | "OPEN";
export type BaseLangCode = "EN" | "DE";

export interface SpeakingTask {
  id: string;
  lang: BaseLangCode;
  kind: SpeakingKind;
  /** banda de dificultad para elegir la lectura segun el nivel estimado */
  band: "low" | "mid" | "high" | "any";
  /** texto a leer (READ_ALOUD) o pregunta (OPEN) en el idioma meta */
  text: string;
  instructionEs: string;
}

export const SPEAKING_TASKS: SpeakingTask[] = [
  { id: "en-read-low", lang: "EN", kind: "READ_ALOUD", band: "low", text: "I like to drink coffee in the morning with my family.", instructionEs: "Lee esta frase en voz alta." },
  { id: "en-read-mid", lang: "EN", kind: "READ_ALOUD", band: "mid", text: "Last weekend I visited my grandparents and we cooked a big dinner together.", instructionEs: "Lee esta frase en voz alta." },
  { id: "en-read-high", lang: "EN", kind: "READ_ALOUD", band: "high", text: "Although the weather was terrible, we decided to continue our journey through the mountains.", instructionEs: "Lee esta frase en voz alta." },
  { id: "en-open", lang: "EN", kind: "OPEN", band: "any", text: "Tell me about your favourite place in your city. Why do you like it?", instructionEs: "Responde en inglés durante unos 20 segundos." },
  { id: "de-read-low", lang: "DE", kind: "READ_ALOUD", band: "low", text: "Ich trinke morgens gern Kaffee mit meiner Familie.", instructionEs: "Lee esta frase en voz alta." },
  { id: "de-read-mid", lang: "DE", kind: "READ_ALOUD", band: "mid", text: "Am Wochenende habe ich meine Großeltern besucht und wir haben zusammen gekocht.", instructionEs: "Lee esta frase en voz alta." },
  { id: "de-read-high", lang: "DE", kind: "READ_ALOUD", band: "high", text: "Obwohl das Wetter schrecklich war, haben wir beschlossen, unsere Reise durch die Berge fortzusetzen.", instructionEs: "Lee esta frase en voz alta." },
  { id: "de-open", lang: "DE", kind: "OPEN", band: "any", text: "Erzähl mir von deinem Lieblingsort in deiner Stadt. Warum magst du ihn?", instructionEs: "Responde en alemán durante unos 20 segundos." },
];

export function bandForLevel(level: CefrLevel): "low" | "mid" | "high" {
  if (level === "A1" || level === "A2") return "low";
  if (level === "B1") return "mid";
  return "high";
}

/** Las dos tareas de habla de un intento: una lectura segun el nivel y una abierta. */
export function speakingTasksFor(lang: BaseLangCode, level: CefrLevel): SpeakingTask[] {
  const band = bandForLevel(level);
  const read = SPEAKING_TASKS.find((t) => t.lang === lang && t.kind === "READ_ALOUD" && t.band === band)!;
  const open = SPEAKING_TASKS.find((t) => t.lang === lang && t.kind === "OPEN")!;
  return [read, open];
}

export function speakingTaskById(id: string): SpeakingTask | undefined {
  return SPEAKING_TASKS.find((t) => t.id === id);
}
