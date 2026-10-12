/**
 * Especificacion de examenes en codigo (fuente: docs/PLAN-EXAMENES.md).
 * Describe el FORMATO de cada examen; nunca copia contenido oficial.
 */
export type ExamCode = "IELTS_ACADEMIC" | "GOETHE_B1" | "GOETHE_B2" | "GOETHE_C1" | "TESTDAF";
export type ExamSectionCode = "LISTENING" | "READING" | "WRITING" | "SPEAKING";
export type ExamLanguage = "en" | "de";

/** Tipo de bloque del banco (un texto, una grabacion, una tarea o una tarjeta). */
export type BankKind = "reading" | "listening" | "writing1" | "writing2" | "speaking1" | "speaking2";

/** Tipos de pregunta que sabe generar y calificar el motor. */
export type TaskType =
  // seleccion
  | "MCQ_SINGLE"
  | "MCQ_MULTI"
  | "TRUE_FALSE_NOT_GIVEN"
  | "YES_NO_NOT_GIVEN"
  | "RICHTIG_FALSCH"
  | "MATCHING"
  | "MATCHING_HEADINGS"
  | "WHO_SAYS"
  // escritura corta (respuesta en el texto o audio)
  | "SENTENCE_COMPLETION"
  | "SUMMARY_COMPLETION"
  | "NOTE_COMPLETION"
  | "TABLE_COMPLETION"
  | "FORM_COMPLETION"
  | "SHORT_ANSWER"
  | "MAP_LABELLING"
  | "GAP_FILL"
  | "SENTENCE_INSERTION"
  // produccion
  | "ESSAY"
  | "GRAPH_REPORT"
  | "FORUM_POST"
  | "FORMAL_MESSAGE"
  | "SUMMARY_WRITING"
  | "SPEAKING_INTERVIEW"
  | "SPEAKING_LONG_TURN"
  | "SPEAKING_DISCUSSION"
  | "SPEAKING_PRESENTATION"
  | "SPEAKING_RECORDED";

export interface PartSpec {
  part: number;
  title: string;
  /** descripcion para el generador y para la pantalla */
  description: string;
  taskTypes: TaskType[];
  items: number;
  /** minutos sugeridos (o reales) para la parte */
  minutes: number;
  /** veces que suena el audio (Listening/Hören) */
  plays?: number;
  /** numero de hablantes del audio */
  speakers?: number;
  /** extension del texto o audio en palabras (aprox.) */
  words?: [number, number];
  /** palabras minimas (Writing) */
  minWords?: number;
  /** segundos de preparacion y de habla (Speaking) */
  prepSeconds?: number;
  speakSeconds?: number;
}

export interface SectionSpec {
  section: ExamSectionCode;
  /** nombre visible en el idioma del examen */
  name: string;
  minutes: number;
  /** tiempo extra al final (revisar/transferir) */
  reviewMinutes?: number;
  parts: PartSpec[];
  /** maximo de puntos brutos de la seccion */
  rawMax: number;
}

export interface ExamSpec {
  code: ExamCode;
  name: string;
  shortName: string;
  language: ExamLanguage;
  /** variantes de perfil que pueden elegirlo */
  profiles: ("EN_US" | "EN_GB" | "DE")[];
  purposeEs: string;
  levelEs: string;
  scaleEs: string;
  /** nivel MCER objetivo (para elegir dificultad del banco) */
  cefr: "B1" | "B2" | "C1" | "ALL";
  sections: SectionSpec[];
  /** orden del simulacro completo */
  mockOrder: ExamSectionCode[];
  /** pausa minima entre secciones escritas (min) */
  breakMinutes?: number;
  disclaimerEs: string;
}

export function totalItems(section: SectionSpec): number {
  return section.parts.reduce((s, p) => s + p.items, 0);
}
