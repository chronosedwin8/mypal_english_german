/**
 * Recursos controlados por acceso. Una sola funcion decide (`can`, en el servidor):
 * usuario → (institucion/grupo, fase 10) → plan → valor global. La primera regla gana.
 */
export const RESOURCES = {
  "exam.practice": "Práctica autocalificada (Listening/Reading)",
  "exam.writing": "Corrección de Writing con IA",
  "exam.speaking": "Speaking con examinador por voz",
  "exam.mock": "Simulacro completo",
  "exam.adhoc": "Generación de preguntas al momento",
  "tutor.avatar": "Tutor con avatar (Tavus)",
  "tutor.kids": "Modo niños (Nuez)",
} as const;

export type Resource = keyof typeof RESOURCES;
