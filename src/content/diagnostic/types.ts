export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1";
export type SkillName = "GRAMMAR" | "VOCAB" | "READING" | "LISTENING";

export interface ItemDef {
  /** codigo estable: "en-a1-01" */
  id: string;
  skill: SkillName;
  level: CefrLevel;
  stem: string;
  passage?: string;
  /** texto que se convierte en audio (solo LISTENING) */
  audioText?: string;
  /** la opcion correcta va SIEMPRE primero aqui; al servir se barajan */
  options: [string, ...string[]];
  explanationEs?: string;
}

/** Dificultad IRT (logits) base por nivel MCER. */
export const LEVEL_DIFFICULTY: Record<CefrLevel, number> = {
  A1: -2.2,
  A2: -1.1,
  B1: 0,
  B2: 1.1,
  C1: 2.2,
};
