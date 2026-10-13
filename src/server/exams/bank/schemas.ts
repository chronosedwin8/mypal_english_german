/**
 * Esquemas de los bloques del banco. La IA devuelve el bloque COMPLETO (con clave);
 * al guardarlo se separa en `content` (publico) y `answerKey` (nunca sale al navegador).
 */
import { z } from "zod";

import type { BankKind } from "@/content/exams/types";

export type { BankKind };

export const OBJECTIVE_TASK_TYPES = [
  "MCQ_SINGLE",
  "TRUE_FALSE_NOT_GIVEN",
  "YES_NO_NOT_GIVEN",
  "RICHTIG_FALSCH",
  "MATCHING",
  "MATCHING_HEADINGS",
  "WHO_SAYS",
  "SENTENCE_COMPLETION",
  "SUMMARY_COMPLETION",
  "NOTE_COMPLETION",
  "TABLE_COMPLETION",
  "FORM_COMPLETION",
  "SHORT_ANSWER",
  "MAP_LABELLING",
  "GAP_FILL",
  "SENTENCE_INSERTION",
] as const;
export type ObjectiveTaskType = (typeof OBJECTIVE_TASK_TYPES)[number];

/** Tipos en los que la persona ESCRIBE la respuesta (se valida contra el texto). */
export const COMPLETION_TYPES: ObjectiveTaskType[] = [
  "SENTENCE_COMPLETION",
  "SUMMARY_COMPLETION",
  "NOTE_COMPLETION",
  "TABLE_COMPLETION",
  "FORM_COMPLETION",
  "SHORT_ANSWER",
  "GAP_FILL",
];
/** Tipos con una lista de opciones compartida por todo el grupo. */
export const SHARED_OPTION_TYPES: ObjectiveTaskType[] = ["MATCHING", "MATCHING_HEADINGS", "MAP_LABELLING", "WHO_SAYS", "SENTENCE_INSERTION"];
export const JUDGEMENT_ANSWERS: Partial<Record<ObjectiveTaskType, string[]>> = {
  TRUE_FALSE_NOT_GIVEN: ["TRUE", "FALSE", "NOT GIVEN"],
  YES_NO_NOT_GIVEN: ["YES", "NO", "NOT GIVEN"],
  RICHTIG_FALSCH: ["RICHTIG", "FALSCH"],
};

const Option = z.object({
  key: z.string().min(1).max(5).describe("Option label: A, B, C… or i, ii, iii… for headings"),
  text: z.string().min(1),
});
export type Option = z.infer<typeof Option>;

const Question = z.object({
  number: z.number().int().min(1).max(60),
  prompt: z
    .string()
    .min(1)
    .describe("Statement, question or sentence. Completion items contain exactly one gap written as ___ (three underscores)."),
  options: z.array(Option).nullable().describe("Only for MCQ_SINGLE: the options of THIS question (A–D). Otherwise null."),
  answers: z
    .array(z.string().min(1))
    .min(1)
    .max(6)
    .describe("Accepted answers. First = main answer. Option key for choice items; TRUE/FALSE/NOT GIVEN etc. for judgements."),
  evidence: z.string().min(3).describe("Exact words copied from the text/transcript that justify the answer"),
  explanationEs: z.string().min(5).describe("Short explanation in Spanish for the learner"),
});
export type Question = z.infer<typeof Question>;

const Group = z.object({
  taskType: z.enum(OBJECTIVE_TASK_TYPES),
  instructions: z.string().min(5),
  title: z.string().nullable().describe("Heading of the form, notes, table or summary (completion), otherwise null"),
  wordLimit: z.number().int().min(1).max(4).nullable().describe("Max words per answer for completion types, otherwise null"),
  sharedOptions: z.array(Option).nullable().describe("Options shared by the group (matching, headings, map letters), otherwise null"),
  questions: z.array(Question).min(1).max(14),
});
export type QuestionGroup = z.infer<typeof Group>;

const Paragraph = z.object({ label: z.string().min(1).max(2), text: z.string().min(20) });

export const ReadingBlockSchema = z.object({
  topic: z.string().min(3).max(120),
  targetBand: z.number().min(4).max(9),
  passage: z.object({
    title: z.string().min(3),
    paragraphs: z.array(Paragraph).min(4).max(10),
  }),
  groups: z.array(Group).min(1).max(8),
});
export type ReadingBlock = z.infer<typeof ReadingBlockSchema>;

const Speaker = z.object({
  id: z.string().min(1).max(12).describe("Short id used in lines, e.g. S1"),
  name: z.string().min(1),
  role: z.string().min(1),
  gender: z.enum(["F", "M"]),
  accent: z.enum(["UK", "US", "AU", "ANY"]),
});
const Line = z.object({
  speaker: z.string().min(1).describe("Speaker id, or NARRATOR"),
  text: z.string().min(1),
});
const Segment = z.object({
  questionsFrom: z.number().int().min(1),
  questionsTo: z.number().int().min(1),
  lines: z.array(Line).min(1),
});
const MapPlace = z.object({
  key: z.string().max(2).nullable().describe("Letter shown on the map if this place is an answer option, else null"),
  name: z.string().nullable().describe("Visible name of a landmark (null for lettered places)"),
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(7),
  w: z.number().int().min(1).max(4),
  h: z.number().int().min(1).max(3),
});
const MapSpec = z.object({
  title: z.string(),
  places: z.array(MapPlace).min(4).max(16),
  paths: z
    .array(z.object({ x1: z.number().min(0).max(12), y1: z.number().min(0).max(8), x2: z.number().min(0).max(12), y2: z.number().min(0).max(8) }))
    .max(10)
    .describe("Roads or paths on a 12×8 grid"),
  entrance: z.object({ x: z.number().min(0).max(12), y: z.number().min(0).max(8), label: z.string() }).nullable(),
});
export type MapSpec = z.infer<typeof MapSpec>;

export const ListeningBlockSchema = z.object({
  topic: z.string().min(3).max(120),
  targetBand: z.number().min(4).max(9),
  context: z.string().min(5).describe("One-line description of the situation"),
  speakers: z.array(Speaker).min(1).max(4),
  segments: z.array(Segment).min(1).max(2).describe("Audio is split where the candidate gets reading time"),
  map: MapSpec.nullable(),
  groups: z.array(Group).min(1).max(10),
});
export type ListeningBlock = z.infer<typeof ListeningBlockSchema>;

export const ChartSchema = z.object({
  kind: z.enum(["line", "bar", "pie", "table"]),
  title: z.string().min(3),
  unit: z.string().describe("Unit of the values, e.g. %, millions of tonnes"),
  categories: z.array(z.string().min(1)).min(2).max(10).describe("x-axis labels (line/bar), slices (pie) or rows (table)"),
  series: z
    .array(z.object({ name: z.string().min(1), values: z.array(z.number()) }))
    .min(1)
    .max(5)
    .describe("Each series has one value per category"),
});
export type Chart = z.infer<typeof ChartSchema>;

export const WritingTask1Schema = z.object({
  topic: z.string().min(3).max(120),
  targetBand: z.number().min(4).max(9),
  prompt: z.string().min(40).describe("Task text as printed in the exam"),
  chart: ChartSchema,
  keyFeatures: z.array(z.string()).min(3).max(8).describe("Main features a good overview must mention"),
  modelAnswer: z.string().min(400),
});
export type WritingTask1 = z.infer<typeof WritingTask1Schema>;

export const WritingTask2Schema = z.object({
  topic: z.string().min(3).max(120),
  targetBand: z.number().min(4).max(9),
  essayType: z.enum(["opinion", "discussion", "problem_solution", "advantages_disadvantages", "two_part"]),
  prompt: z.string().min(60).describe("Statement + instruction, as printed in the exam"),
  keyIdeas: z.array(z.string()).min(3).max(8),
  modelAnswer: z.string().min(1000),
});
export type WritingTask2 = z.infer<typeof WritingTask2Schema>;

export const SpeakingPart1Schema = z.object({
  topic: z.string().min(3).max(120),
  targetBand: z.number().min(4).max(9),
  frames: z
    .array(z.object({ topic: z.string().min(2), questions: z.array(z.string().min(5)).min(3).max(5) }))
    .min(2)
    .max(3),
});
export type SpeakingPart1 = z.infer<typeof SpeakingPart1Schema>;

export const SpeakingPart2Schema = z.object({
  topic: z.string().min(3).max(120),
  targetBand: z.number().min(4).max(9),
  card: z.object({
    task: z.string().min(10).describe("Describe a …"),
    cuePoints: z.array(z.string().min(3)).min(3).max(4),
    finalLine: z.string().min(5).describe("and explain …"),
  }),
  roundingOff: z.array(z.string().min(5)).min(1).max(2),
  /** Parte 3: discusion ligada al tema de la tarjeta */
  discussion: z
    .array(z.object({ theme: z.string().min(3), questions: z.array(z.string().min(8)).min(2).max(4) }))
    .min(2)
    .max(3),
});
export type SpeakingPart2 = z.infer<typeof SpeakingPart2Schema>;


/** Tarea de escritura de los examenes de aleman (Goethe, TestDaF). */
export const WritingTaskSchema = z.object({
  topic: z.string().min(3).max(120),
  targetBand: z.number().min(4).max(9),
  register: z.enum(["formal", "informal", "neutral"]),
  prompt: z.string().min(40).describe("Situation and instruction as printed in the exam, in the exam language"),
  contentPoints: z.array(z.string().min(3)).min(2).max(4).describe("Points the text must cover (Inhaltspunkte)"),
  chart: ChartSchema.nullable().describe("Only if the task is based on a graph, else null"),
  modelAnswer: z.string().min(200),
});
export type WritingTask = z.infer<typeof WritingTaskSchema>;

/** Tarea oral de los examenes de aleman: presentacion, discusion, planificacion o grabada (TestDaF). */
export const SpeakingTaskSchema = z.object({
  topic: z.string().min(3).max(120),
  targetBand: z.number().min(4).max(9),
  mode: z.enum(["presentation", "discussion", "planning", "recorded", "interview"]),
  situation: z.string().min(20).describe("Task instructions shown to the candidate, in the exam language"),
  points: z.array(z.string().min(2)).min(2).max(6).describe("Slides, guiding points or aspects to address"),
  partnerView: z.string().nullable().describe("Opinion of the virtual partner in a discussion/planning task, else null"),
  questions: z.array(z.string().min(5)).min(2).max(8).describe("Questions or reactions of the examiner/partner, in order"),
});
export type SpeakingTask = z.infer<typeof SpeakingTaskSchema>;

export type AnyBlock =
  | { kind: "reading"; data: ReadingBlock }
  | { kind: "listening"; data: ListeningBlock }
  | { kind: "writing1"; data: WritingTask1 }
  | { kind: "writing2"; data: WritingTask2 }
  | { kind: "speaking1"; data: SpeakingPart1 }
  | { kind: "speaking2"; data: SpeakingPart2 }
  | { kind: "writingTask"; data: WritingTask }
  | { kind: "speakingTask"; data: SpeakingTask };

export const SCHEMA_BY_KIND = {
  reading: ReadingBlockSchema,
  listening: ListeningBlockSchema,
  writing1: WritingTask1Schema,
  writing2: WritingTask2Schema,
  speaking1: SpeakingPart1Schema,
  speaking2: SpeakingPart2Schema,
  writingTask: WritingTaskSchema,
  speakingTask: SpeakingTaskSchema,
} as const;

/** Grupo sin clave (lo que ve la persona). */
export interface PublicGroup {
  taskType: ObjectiveTaskType;
  instructions: string;
  title: string | null;
  wordLimit: number | null;
  sharedOptions: Option[] | null;
  questions: { number: number; prompt: string; options: Option[] | null }[];
}

export interface QuestionKey {
  answers: string[];
  evidence: string;
  explanationEs: string;
  taskType: ObjectiveTaskType;
  wordLimit: number | null;
}

function publicGroups(groups: QuestionGroup[]): PublicGroup[] {
  return groups.map((g) => ({
    taskType: g.taskType,
    instructions: g.instructions,
    title: g.title,
    wordLimit: g.wordLimit,
    sharedOptions: g.sharedOptions,
    questions: g.questions.map((q) => ({ number: q.number, prompt: q.prompt, options: q.options })),
  }));
}

function questionKeys(groups: QuestionGroup[]): Record<string, QuestionKey> {
  const out: Record<string, QuestionKey> = {};
  for (const g of groups)
    for (const q of g.questions)
      out[String(q.number)] = {
        answers: q.answers,
        evidence: q.evidence,
        explanationEs: q.explanationEs,
        taskType: g.taskType,
        wordLimit: g.wordLimit,
      };
  return out;
}

/** Separa el bloque en contenido publico y clave. El guion de Listening es parte de la clave. */
export function splitBlock(block: AnyBlock): { content: Record<string, unknown>; answerKey: Record<string, unknown> } {
  switch (block.kind) {
    case "reading": {
      const d = block.data;
      return {
        content: { kind: "reading", passage: d.passage, groups: publicGroups(d.groups) },
        answerKey: { kind: "reading", questions: questionKeys(d.groups) },
      };
    }
    case "listening": {
      const d = block.data;
      return {
        content: {
          kind: "listening",
          context: d.context,
          speakers: d.speakers.map((s) => ({ id: s.id, name: s.name, role: s.role })),
          segments: d.segments.map((s) => ({ questionsFrom: s.questionsFrom, questionsTo: s.questionsTo })),
          map: d.map,
          groups: publicGroups(d.groups),
        },
        answerKey: { kind: "listening", questions: questionKeys(d.groups), speakers: d.speakers, segments: d.segments },
      };
    }
    case "writing1":
      return {
        content: { kind: "writing1", prompt: block.data.prompt, chart: block.data.chart },
        answerKey: { kind: "writing1", keyFeatures: block.data.keyFeatures, modelAnswer: block.data.modelAnswer },
      };
    case "writing2":
      return {
        content: { kind: "writing2", prompt: block.data.prompt, essayType: block.data.essayType },
        answerKey: { kind: "writing2", keyIdeas: block.data.keyIdeas, modelAnswer: block.data.modelAnswer },
      };
    case "speaking1":
      return { content: { kind: "speaking1", frames: block.data.frames }, answerKey: { kind: "speaking1" } };
    case "speaking2":
      return {
        content: { kind: "speaking2", card: block.data.card, roundingOff: block.data.roundingOff, discussion: block.data.discussion },
        answerKey: { kind: "speaking2" },
      };
    case "writingTask": {
      const d = block.data;
      return {
        content: { kind: "writingTask", prompt: d.prompt, register: d.register, contentPoints: d.contentPoints, chart: d.chart },
        answerKey: { kind: "writingTask", keyIdeas: d.contentPoints, modelAnswer: d.modelAnswer },
      };
    }
    case "speakingTask": {
      const d = block.data;
      return {
        content: { kind: "speakingTask", mode: d.mode, situation: d.situation, points: d.points, partnerView: d.partnerView, questions: d.questions },
        answerKey: { kind: "speakingTask" },
      };
    }
  }
}

/** Todas las preguntas de un bloque objetivo, en orden. */
export function allQuestions(groups: QuestionGroup[]): (Question & { group: QuestionGroup })[] {
  return groups.flatMap((g) => g.questions.map((q) => ({ ...q, group: g }))).sort((a, b) => a.number - b.number);
}
