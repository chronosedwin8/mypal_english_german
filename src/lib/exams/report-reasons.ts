/** Motivos para reportar una pregunta (los ve el estudiante y el equipo de moderacion). */
export const REPORT_REASONS = {
  WRONG_KEY: "La respuesta correcta está mal",
  AMBIGUOUS: "Hay más de una respuesta posible",
  AUDIO: "El audio no coincide o no se entiende",
  TYPO: "Error de redacción o de ortografía",
  OTHER: "Otro",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;
