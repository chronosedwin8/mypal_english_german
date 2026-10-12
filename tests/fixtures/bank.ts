/**
 * Bloques validos de ejemplo para probar el pipeline sin gastar IA.
 * Reading Passage 1 (preguntas 1–13) y Listening Part 4 (preguntas 31–40).
 */
import type { ListeningBlock, ReadingBlock } from "@/server/exams/bank/schemas";

const FILLER =
  "Researchers continue to study the region in considerable detail, comparing records from different decades and discussing how local conditions have shaped the results they observe. ";

const FACTS = [
  "The river carries sediment to the coast every spring.",
  "Engineers built the first bridge from local granite in the valley.",
  "Farmers in the north grow barley because the summers are short.",
  "The old harbour was closed after the channel became too shallow.",
  "Visitors mostly arrive by train rather than by car.",
  "The museum keeps a collection of maps drawn by sailors.",
  "Migrating geese stop at the wetlands during autumn.",
  "The town council introduced a ferry service to the island.",
  "Most of the timber was exported to markets abroad.",
  "A storm in the last century destroyed the lighthouse.",
  "Children learn traditional songs at the village school.",
  "The new reservoir supplies water to three cities.",
];

const COMPLETION: { sentence: string; prompt: string; answer: string }[] = [
  { sentence: "The river carries sediment to the coast every spring.", prompt: "Each spring the river takes ___ to the coast.", answer: "sediment" },
  { sentence: "Engineers built the first bridge from local granite in the valley.", prompt: "The first bridge was made of local ___.", answer: "granite" },
  { sentence: "Farmers in the north grow barley because the summers are short.", prompt: "Northern farmers grow ___ due to short summers.", answer: "barley" },
  { sentence: "The museum keeps a collection of maps drawn by sailors.", prompt: "The museum holds maps made by ___.", answer: "sailors" },
  { sentence: "Migrating geese stop at the wetlands during autumn.", prompt: "In autumn, geese rest at the ___.", answer: "wetlands" },
  { sentence: "The town council introduced a ferry service to the island.", prompt: "A ___ service now links the island.", answer: "ferry" },
  { sentence: "The new reservoir supplies water to three cities.", prompt: "Three cities get water from the new ___.", answer: "reservoir" },
];

export function readingFixture(): ReadingBlock {
  const paragraphs = Array.from({ length: 6 }, (_, i) => ({
    label: String.fromCharCode(65 + i),
    text: [FACTS[i * 2], FILLER, FACTS[i * 2 + 1], FILLER, FILLER, FILLER].join(" ").replace(/\s+/g, " ").trim(),
  }));
  const tfng: ReadingBlock["groups"][number] = {
    taskType: "TRUE_FALSE_NOT_GIVEN",
    instructions: "Do the following statements agree with the information given in Reading Passage 1?",
    title: null,
    wordLimit: null,
    sharedOptions: null,
    questions: [
      { prompt: "The river transports sediment towards the sea.", answers: ["TRUE"], evidence: FACTS[0] },
      { prompt: "The first bridge was built with imported stone.", answers: ["FALSE"], evidence: FACTS[1] },
      { prompt: "Barley sells for a high price in the north.", answers: ["NOT GIVEN"], evidence: FACTS[2] },
      { prompt: "The harbour closed because the channel was not deep enough.", answers: ["TRUE"], evidence: FACTS[3] },
      { prompt: "Most visitors drive to the area.", answers: ["FALSE"], evidence: FACTS[4] },
      { prompt: "The lighthouse was rebuilt after the storm.", answers: ["NOT GIVEN"], evidence: FACTS[9] },
    ].map((q, i) => ({ number: i + 1, options: null, explanationEs: "Explicación de prueba.", ...q })),
  };
  const completion: ReadingBlock["groups"][number] = {
    taskType: "SENTENCE_COMPLETION",
    instructions: "Complete the sentences. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
    title: null,
    wordLimit: 2,
    sharedOptions: null,
    questions: COMPLETION.map((c, i) => ({
      number: 7 + i,
      prompt: c.prompt,
      options: null,
      answers: [c.answer],
      evidence: c.sentence,
      explanationEs: "Explicación de prueba.",
    })),
  };
  return { topic: "A river valley and its towns", targetBand: 6.5, passage: { title: "Life in the River Valley", paragraphs }, groups: [tfng, completion] };
}

const LECTURE_ANSWERS = ["copper", "furnaces", "charcoal", "tin", "moulds", "trade", "jewellery", "tools", "recycling", "museums"];

export function listeningFixture(): ListeningBlock {
  const talk =
    "Today we are looking at the history of an ancient metal industry and the way it changed everyday life across a wide region over many centuries of slow development. ";
  const lines = LECTURE_ANSWERS.map((a, i) => ({
    speaker: "S1",
    text: `${talk}Point number ${i + 1} is that the workers relied on ${a} for this stage of the process. ${talk}`,
  }));
  return {
    topic: "An ancient metal industry",
    targetBand: 7,
    context: "A lecture about an ancient metal industry.",
    speakers: [{ id: "S1", name: "Dr Lane", role: "lecturer", gender: "F", accent: "UK" }],
    segments: [
      {
        questionsFrom: 31,
        questionsTo: 40,
        lines: [
          { speaker: "NARRATOR", text: "Part 4. You will hear a lecture. First, you have some time to look at questions 31 to 40." },
          ...lines,
          { speaker: "NARRATOR", text: "That is the end of Part 4." },
        ],
      },
    ],
    map: null,
    groups: [
      {
        taskType: "NOTE_COMPLETION",
        instructions: "Complete the notes below. Write ONE WORD ONLY for each answer.",
        title: "The ancient metal industry",
        wordLimit: 1,
        sharedOptions: null,
        questions: LECTURE_ANSWERS.map((a, i) => ({
          number: 31 + i,
          prompt: `Stage ${i + 1} depended on ___`,
          options: null,
          answers: [a],
          evidence: `the workers relied on ${a} for this stage`,
          explanationEs: "Explicación de prueba.",
        })),
      },
    ],
  };
}

/** Respuestas correctas de un bloque (lo que diria un resolutor perfecto). */
export function perfectAnswers(block: { groups: { questions: { number: number; answers: string[] }[] }[] }) {
  return {
    answers: block.groups.flatMap((g) => g.questions.map((q) => ({ number: q.number, answer: q.answers[0], alternative: null as string | null, confidence: 0.95 }))),
  };
}

export const GOOD_VERDICT = {
  authenticity: 8.5,
  levelFit: 8,
  clarity: 9,
  fairness: 9.5,
  overall: 8.6,
  estimatedBand: 6.5,
  problems: [],
};
