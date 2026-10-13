import type { ExamSpec } from "./types";

/** TestDaF digital (B2–C1). Siete tareas por seccion; resultado TDN 3, 4 o 5. */
export const TESTDAF: ExamSpec = {
  code: "TESTDAF",
  name: "TestDaF",
  shortName: "TestDaF",
  language: "de",
  profiles: ["DE"],
  purposeEs: "Admisión a universidades alemanas.",
  levelEs: "B2 a C1",
  scaleEs: "TDN 3, 4 o 5 por sección",
  cefr: "C1",
  mockOrder: ["READING", "LISTENING", "WRITING", "SPEAKING"],
  disclaimerEs:
    "Preparación independiente para el TestDaF. No estamos afiliados al TestDaF-Institut. La nota es una estimación (los cortes de TDN son aproximados).",
  sections: [
    {
      section: "READING",
      name: "Lesen",
      minutes: 55,
      rawMax: 34,
      parts: [
        { part: 1, title: "Aufgabe 1", description: "Gap fill in a short text.", taskTypes: ["GAP_FILL"], items: 6, minutes: 7, words: [200, 300] },
        { part: 2, title: "Aufgabe 2", description: "Put sentences in order.", taskTypes: ["SENTENCE_INSERTION"], items: 5, minutes: 7, words: [200, 300] },
        { part: 3, title: "Aufgabe 3", description: "Multiple choice on an academic text.", taskTypes: ["MCQ_SINGLE"], items: 5, minutes: 9, words: [500, 650] },
        { part: 4, title: "Aufgabe 4", description: "Classify statements (pro/contra/neutral).", taskTypes: ["MATCHING"], items: 5, minutes: 8, words: [450, 600] },
        { part: 5, title: "Aufgabe 5", description: "Match speech acts.", taskTypes: ["MATCHING"], items: 4, minutes: 8, words: [300, 400] },
        { part: 6, title: "Aufgabe 6", description: "Match pairs of concepts.", taskTypes: ["MATCHING"], items: 4, minutes: 8, words: [300, 400] },
        { part: 7, title: "Aufgabe 7", description: "Find errors in a summary (richtig/falsch).", taskTypes: ["RICHTIG_FALSCH"], items: 5, minutes: 8, words: [500, 650] },
      ],
    },
    {
      section: "LISTENING",
      name: "Hören",
      minutes: 40,
      rawMax: 30,
      parts: [
        { part: 1, title: "Aufgabe 1", description: "Short answers on a conversation.", taskTypes: ["SHORT_ANSWER"], items: 5, minutes: 5, plays: 1, speakers: 2, words: [300, 400] },
        { part: 2, title: "Aufgabe 2", description: "Find errors in a summary (richtig/falsch).", taskTypes: ["RICHTIG_FALSCH"], items: 4, minutes: 6, plays: 1, speakers: 1, words: [400, 500] },
        { part: 3, title: "Aufgabe 3", description: "Match people and statements.", taskTypes: ["WHO_SAYS"], items: 4, minutes: 6, plays: 1, speakers: 3, words: [450, 550] },
        { part: 4, title: "Aufgabe 4", description: "Multiple choice on a lecture (with slides).", taskTypes: ["MCQ_SINGLE"], items: 5, minutes: 7, plays: 1, speakers: 1, words: [550, 700] },
        { part: 5, title: "Aufgabe 5", description: "Note completion on a lecture (with slides).", taskTypes: ["NOTE_COMPLETION"], items: 4, minutes: 6, plays: 1, speakers: 1, words: [550, 700] },
        { part: 6, title: "Aufgabe 6", description: "Multiple choice on a discussion.", taskTypes: ["MCQ_SINGLE"], items: 4, minutes: 5, plays: 1, speakers: 2, words: [400, 500] },
        { part: 7, title: "Aufgabe 7", description: "Relate sound and spelling.", taskTypes: ["GAP_FILL"], items: 4, minutes: 5, plays: 1, speakers: 1, words: [150, 250] },
      ],
    },
    {
      section: "WRITING",
      name: "Schreiben",
      minutes: 60,
      rawMax: 10,
      parts: [
        { part: 1, title: "Aufgabe 1", description: "Argumentative essay.", taskTypes: ["ESSAY"], items: 1, minutes: 30, minWords: 200 },
        { part: 2, title: "Aufgabe 2", description: "Summary of a text and a graph.", taskTypes: ["SUMMARY_WRITING"], items: 1, minutes: 30, minWords: 100 },
      ],
    },
    {
      section: "SPEAKING",
      name: "Sprechen",
      minutes: 35,
      rawMax: 30,
      parts: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
        part: n,
        title: `Aufgabe ${n}`,
        description: n === 1 ? "Warm-up: short personal answer." : "Recorded answer to an academic situation.",
        taskTypes: ["SPEAKING_RECORDED" as const],
        items: 1,
        minutes: 4,
        prepSeconds: n === 1 ? 30 : 90,
        speakSeconds: n === 1 ? 45 : 120,
      })),
    },
  ],
};
