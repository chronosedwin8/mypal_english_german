/**
 * Instrucciones versionadas para generar, corregir, resolver y juzgar bloques.
 * Si cambias cualquier texto de este archivo, sube PROMPT_VERSION: cada bloque guarda
 * la version con la que se hizo.
 */
import type { ExamCode, PartSpec, SectionSpec } from "@/content/exams/types";

import type { AnyBlock, BankKind, ListeningBlock, ObjectiveTaskType, QuestionGroup, ReadingBlock } from "./schemas";

export const PROMPT_VERSION = "bank-2026-10-v2";

const ITEM_WRITER_SYSTEM_DE = `You are a senior item writer producing ORIGINAL German-language practice material in the format of the Goethe-Zertifikat and TestDaF exams.
Rules:
- All exam content (texts, transcripts, questions, options, instructions) is written in natural Standard German (Hochdeutsch) with correct umlauts and ß. Only "explanationEs" is in Spanish.
- Everything is new: never copy or adapt published Goethe-Institut Modellsätze or TestDaF material, and never name the exam providers in the content.
- Content is fair for candidates from any country: avoid politics, religion, war, disasters, distressing topics and local knowledge.
- Match the CEFR level of the exam in vocabulary and sentence complexity.
- Return ONLY JSON that matches the schema.`;

export function itemWriterSystem(exam: ExamCode): string {
  return exam === "IELTS_ACADEMIC" ? ITEM_WRITER_SYSTEM : ITEM_WRITER_SYSTEM_DE;
}

export const ITEM_WRITER_SYSTEM = `You are a senior item writer producing ORIGINAL practice material in the format of the computer-delivered IELTS Academic test.
Rules:
- Everything you write is new. Never copy, adapt or paraphrase published Cambridge, British Council or IDP material, and never name the IELTS partners in the content.
- Content must be fair to candidates from any country: avoid local knowledge, politics, religion, war, disasters, disease trauma, alcohol, gambling and anything distressing.
- Use British spelling and conventions unless told otherwise.
- Real-world facts must be accurate or clearly generic. Do not invent quotes from real people; invented researchers must have plausible but fictional names.
- Return ONLY JSON that matches the schema.`;

const TASK_GUIDES: Record<ObjectiveTaskType, string> = {
  TRUE_FALSE_NOT_GIVEN:
    'Statements paraphrase facts in the passage (never copy its wording). TRUE = the passage states the same; FALSE = it states the opposite; NOT GIVEN = there is no information. Include all three answers when the group has 5+ items. Items follow the order of the passage. For NOT GIVEN, "evidence" is the nearest related sentence.',
  YES_NO_NOT_GIVEN:
    "Statements about the WRITER'S views or claims. YES = agrees with the writer; NO = contradicts the writer; NOT GIVEN = the writer does not say. Include all three answers when the group has 5+ items. Items follow the passage order.",
  RICHTIG_FALSCH:
    "Statements in German that are RICHTIG or FALSCH according to the text (answers exactly RICHTIG or FALSCH). Paraphrase, do not copy. Mix both answers. Items follow the text order.",
  MCQ_SINGLE:
    "Each question has its own options (Reading: A–D; Listening: A–C). Exactly one is correct; distractors are mentioned or implied in the text but wrong. Do not use 'all/none of the above'. Questions follow the order of the text.",
  MATCHING:
    "Match statements/features to a list of people, places, dates or categories in sharedOptions (letters A, B, C…). Provide more options than are needed OR say 'You may use any letter more than once' in the instructions.",
  MATCHING_HEADINGS:
    "sharedOptions are headings keyed i, ii, iii, iv… (lower-case roman numerals) with at least 2 more headings than paragraphs to match. Each question prompt is 'Paragraph X'. Distractor headings mention details of a paragraph but not its main idea.",
  WHO_SAYS:
    "sharedOptions are the speakers (keys a, b, c… with the speaker names, include the moderator if relevant). Each item is a paraphrased statement; the answer is the speaker who expresses it. Every speaker is used at least once.",
  SENTENCE_COMPLETION:
    "Each item is a paraphrased sentence with exactly one gap ___. The answer is copied word for word from the text and fits grammatically. Instructions state the limit in capitals, e.g. 'Choose NO MORE THAN TWO WORDS from the passage for each answer.'",
  SUMMARY_COMPLETION:
    "The group title is the summary heading; each item is one sentence of the summary, in order, with one gap ___. Answers copied word for word from the text. State the word limit in capitals in the instructions.",
  NOTE_COMPLETION:
    "The group title is the notes heading; each item is a note line with one gap ___ (e.g. 'Main cause: ___'). Answers copied word for word from the text. State the word limit in capitals.",
  TABLE_COMPLETION:
    "The group title is the table heading; each item reads 'Row label – column label: ___'. Answers copied word for word from the text. State the word limit in capitals.",
  FORM_COMPLETION:
    "The group title is the form heading; each item is a field with one gap (e.g. 'Surname: ___', 'Date of arrival: ___'). Include a name that is spelled out, a number (phone, price, date or code) and ordinary words. State the word/number limit in capitals, e.g. 'Write ONE WORD AND/OR A NUMBER for each answer.'",
  SHORT_ANSWER:
    "Wh- questions ending with '?'. Answers copied word for word from the text within the word limit, stated in capitals in the instructions.",
  MAP_LABELLING:
    "The map uses a 12×8 grid. Lettered places (key A, B, C…) are the options; give 2 more letters than questions. Add 2–4 named landmarks (name, key null) and paths so directions make sense. The speaker guides the listener with directions relative to the landmarks ('opposite the café', 'past the main entrance on your left'). Question prompts are the names of the places to find; answers are letters.",
  GAP_FILL:
    "Reading: the passage itself contains numbered gaps written as (1) ..., (2) ... and the removed word is the answer; each item prompt is 'Lücke N: ___'. Listening: one gap ___ per item with a word heard in the recording.",
  SENTENCE_INSERTION:
    "The passage contains numbered gaps written as (1), (2)... where a sentence was removed. sharedOptions are the removed sentences plus 2 distractor sentences (keys a–h). Each item prompt is 'Lücke N'; the answer is the key of the sentence that fits.",
};

const READING_PART_GUIDES: Record<number, string> = {
  1: "Passage 1: factual and descriptive, accessible academic style (like a quality magazine). 5–7 paragraphs.",
  2: "Passage 2: more complex academic text with 6–8 paragraphs labelled A, B, C…, suitable for matching headings or information.",
  3: "Passage 3: the hardest. An argument with the writer's views, concessions and evaluation of research. 6–8 paragraphs.",
};

const LISTENING_PART_GUIDES: Record<number, string> = {
  1: "Part 1: a conversation between two people in an everyday social context, e.g. one person asks for information to make a booking. The answers include a name that the speaker spells out letter by letter (say the full name first, then spell it: 'It's Harper, H-A-R-P-E-R'), numbers and dates. Split into 2 segments.",
  2: "Part 2: one speaker in an everyday social context (a guide, an announcement, a talk about local facilities). Split into 2 segments.",
  3: "Part 3: two to four people (e.g. students and a tutor) discussing an academic task. Speakers express and change opinions. Split into 2 segments.",
  4: "Part 4: a university lecture by one speaker on an academic subject, with clear signposting. ONE segment, no break.",
};

const LISTENING_STYLE = `Transcript rules:
- Natural spoken English with occasional hesitation ("well", "let me see") but no stammering.
- Classic distractors: a speaker mentions one option and then corrects it or changes their mind; the correct answer is the final one.
- Every answer is SPOKEN by a speaker (not the NARRATOR), in question order, inside the segment that covers its question numbers.
- Write numbers that are answers in digits exactly as in the answer key (e.g. "15", "0161 496 0732"). If the prompt already shows the unit or currency (e.g. "£___"), the key is the number alone and the speaker says it with the unit as a word ("25 pounds").
- The NARRATOR (speaker id NARRATOR) opens each segment: first segment "Part N. You will hear <context>. First, you have some time to look at questions X to Y." / later segments "Now listen and answer questions X to Y." Do not put answers in narrator lines. End with "That is the end of Part N."
- Accents: assign UK, AU or US to speakers (IELTS uses a mix); use ANY only for extra voices.`;

export interface GenerateRequest {
  exam: ExamCode;
  examName: string;
  language: "en" | "de";
  cefr: string;
  kind: BankKind;
  section: SectionSpec;
  part: PartSpec;
  firstQuestion: number;
  targetBand: number;
  domain: string;
  avoidTopics: string[];
}

function objectiveSpecText(r: GenerateRequest) {
  const last = r.firstQuestion + r.part.items - 1;
  return [
    `Questions: exactly ${r.part.items}, numbered ${r.firstQuestion}–${last}, split into question groups of different task types.`,
    `Allowed task types (use 2–3 of them, each group a single type): ${r.part.taskTypes.join(", ")}.`,
    "Task type guides:",
    ...r.part.taskTypes.map((t) => `- ${t}: ${TASK_GUIDES[t as ObjectiveTaskType] ?? ""}`),
    'For every question give "answers" (main answer first, then acceptable variants such as other spellings or numbers written another way), "evidence" (exact words copied from the text) and "explanationEs" (one or two sentences in Spanish explaining why).',
  ].join("\n");
}

const LISTENING_STYLE_DE = `Transcript rules:
- Natural spoken German suited to the level, with occasional fillers ("also", "na ja") but no stammering.
- Distractors: speakers mention options and then correct themselves; only the final statement counts.
- Every answer is SPOKEN by a speaker (not the NARRATOR), in question order, inside the segment that covers its question numbers.
- The NARRATOR (speaker id NARRATOR) opens in German, e.g. "Teil 1. Sie hören ... Lesen Sie zuerst die Aufgaben." and ends with "Ende von Teil 1." Do not put answers in narrator lines.
- Use accent ANY for all speakers (German voices).`;

function germanPrompt(r: GenerateRequest, common: string[]): string {
  const head = `Write ${r.examName} (${r.cefr}) ${r.section.name} ${r.part.title}: ${r.part.description}`;
  switch (r.kind) {
    case "reading":
      return [
        head,
        `Text length: ${r.part.words?.[0]}–${r.part.words?.[1]} words in German. Use the passage structure to fit the task: one text (paragraphs A, B, C... in order) or several short texts (one per paragraph label, e.g. forum posts or ads, each starting with its title or author).`,
        ...common,
        objectiveSpecText(r),
      ].join("\n");
    case "listening":
      return [
        head,
        `Transcript length: ${r.part.words?.[0]}–${r.part.words?.[1]} words in total. Speakers (without narrator): ${r.part.speakers ?? 1}${(r.part.speakers ?? 1) >= 3 ? " (2–4 allowed)" : ""}. The recording is played ${r.part.plays ?? 1} time(s) in the exam. Use 1 segment unless the part clearly has two halves.`,
        LISTENING_STYLE_DE,
        ...common,
        objectiveSpecText(r),
        "map must be null.",
      ].join("\n");
    case "writingTask":
      return [
        head,
        `Write the task as printed in the exam, in German: the situation and the instruction. Minimum length the candidate must write: ${r.part.minWords} words (${r.part.minutes} minutes).`,
        "contentPoints: 2–4 points the text must cover (Inhaltspunkte), in German, also listed inside the prompt. register: formal, informal or neutral as the task requires.",
        "chart: only for tasks based on a graph or statistics (C1 Teil 1, TestDaF summary); otherwise null.",
        `modelAnswer: an excellent ${r.cefr} answer in German that covers every content point.`,
        ...common,
      ].join("\n");
    case "speakingTask":
      return [
        head,
        "mode: presentation (candidate presents a topic using the points as slides), discussion (candidate and virtual partner discuss and react to each other's opinions), planning (plan something together), recorded (TestDaF: respond to a situation into a recorder) or interview.",
        "situation: the instructions in German as shown to the candidate. points: the slides or aspects to address (2–6). partnerView: what the virtual partner thinks (discussion/planning), else null.",
        "questions: 3–6 short questions or reactions the examiner/partner says during the task, in German and in order.",
        ...common,
      ].join("\n");
    default:
      throw new Error(`Tipo ${r.kind} no disponible en aleman`);
  }
}

export function generationPrompt(r: GenerateRequest): string {
  if (r.language === "de")
    return germanPrompt(r, [
      `Level: ${r.cefr}. Choose vocabulary and grammar a ${r.cefr} candidate is expected to handle.`,
      `Topic area: ${r.domain}. Choose a specific, interesting topic inside this area.`,
      r.avoidTopics.length ? `Do NOT reuse these recent topics: ${r.avoidTopics.join("; ")}.` : "",
    ]);
  const common = [
    `Target difficulty: IELTS band ${r.targetBand} (vocabulary, sentence complexity and how hard the distractors are).`,
    `Topic area: ${r.domain}. Choose a specific, interesting topic inside this area.`,
    r.avoidTopics.length ? `Do NOT reuse these recent topics: ${r.avoidTopics.join("; ")}.` : "",
  ];
  switch (r.kind) {
    case "reading":
      return [
        `Write IELTS Academic Reading ${r.part.title}. ${READING_PART_GUIDES[r.part.part] ?? r.part.description}`,
        `Passage length: ${r.part.words?.[0]}–${r.part.words?.[1]} words. Label paragraphs A, B, C… in order.`,
        ...common,
        objectiveSpecText(r),
      ].join("\n");
    case "listening":
      return [
        `Write IELTS Listening ${r.part.title}. ${LISTENING_PART_GUIDES[r.part.part] ?? r.part.description}`,
        `Transcript length: ${r.part.words?.[0]}–${r.part.words?.[1]} words in total. Speakers (without narrator): ${r.part.speakers ?? 1}${(r.part.speakers ?? 1) >= 3 ? " (2–4 allowed)" : ""}.`,
        LISTENING_STYLE,
        ...common,
        objectiveSpecText(r),
        r.part.taskTypes.includes("MAP_LABELLING") ? "If you use MAP_LABELLING, include the map; otherwise map is null." : "map must be null.",
      ].join("\n");
    case "writing1":
      return [
        "Write an IELTS Academic Writing Task 1 prompt based on a chart, with its data.",
        'The prompt reads like the exam: "The <chart type> below shows … Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words."',
        "Data: realistic but clearly illustrative (no claims about real current statistics), 3–8 categories, 1–4 series, clear trends and at least one striking comparison. Pie values in % add up to 100.",
        "keyFeatures: the main trends/comparisons an examiner expects in the overview. modelAnswer: a band 8–9 response of 170–200 words.",
        ...common,
      ].join("\n");
    case "writing2":
      return [
        "Write an IELTS Academic Writing Task 2 prompt.",
        'Format: a statement or situation in one or two sentences, the question, and then: "Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words."',
        "keyIdeas: arguments a strong answer could develop. modelAnswer: a band 8–9 essay of 280–330 words with a clear position.",
        ...common,
      ].join("\n");
    case "speaking1":
      return [
        "Write an IELTS Speaking Part 1 set: 3 frames. The first frame is about the candidate's work or studies, home town or home; the other two are everyday topics.",
        "Each frame has 4 short personal questions an examiner would ask, from simple to slightly more reflective.",
        ...common,
      ].join("\n");
    case "speaking2":
      return [
        "Write an IELTS Speaking Part 2 task card and the linked Part 3 discussion.",
        'Card: "Describe …", "You should say:" with 3–4 cue points, and a final line beginning "and explain …". roundingOff: 1–2 short follow-up questions.',
        "discussion: 2–3 themes that broaden the card topic to society, each with 3–4 abstract questions (compare, speculate, evaluate).",
        ...common,
      ].join("\n");
    default:
      throw new Error(`Tipo ${r.kind} no disponible en IELTS`);
  }
}

export function repairPrompt(original: unknown, issues: string[], request: string): string {
  return [
    "Below is a block you produced and the problems found by automatic checks and a test-taker review.",
    "Fix ALL problems and return the COMPLETE corrected block (not a diff). Keep what is already correct.",
    "Problems:",
    ...issues.map((i) => `- ${i}`),
    "",
    "Original request:",
    request,
    "",
    "Block:",
    JSON.stringify(original),
  ].join("\n");
}

/* ───────────── resolutor a ciegas ───────────── */

export const SOLVER_SYSTEM = `You are a near-native, top-scoring exam candidate (IELTS band 9, German C2). Answer each question using ONLY the text provided.
- Choice items: answer with the option key only.
- TRUE/FALSE/NOT GIVEN, YES/NO/NOT GIVEN and RICHTIG/FALSCH: answer with those exact words.
- Completion and short-answer items: copy the exact words from the text, respecting the word limit.
- If a second answer is also defensible from the text, put it in "alternative"; otherwise null.
Return ONLY JSON.`;

function groupsForCandidate(groups: QuestionGroup[]): string {
  return groups
    .map((g) => {
      const lines = [`[${g.taskType}] ${g.instructions}`];
      if (g.title) lines.push(`Title: ${g.title}`);
      if (g.wordLimit) lines.push(`Word limit: ${g.wordLimit}`);
      if (g.sharedOptions) lines.push("Options:", ...g.sharedOptions.map((o) => `  ${o.key}. ${o.text}`));
      for (const q of g.questions) {
        lines.push(`${q.number}. ${q.prompt}`);
        if (q.options) lines.push(...q.options.map((o) => `   ${o.key}. ${o.text}`));
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function solverPrompt(block: { kind: "reading"; data: ReadingBlock } | { kind: "listening"; data: ListeningBlock }): string {
  if (block.kind === "reading") {
    const d = block.data;
    return [
      `READING PASSAGE: ${d.passage.title}`,
      ...d.passage.paragraphs.map((p) => `${p.label}. ${p.text}`),
      "",
      "QUESTIONS",
      groupsForCandidate(d.groups),
    ].join("\n");
  }
  const d = block.data;
  const names = new Map(d.speakers.map((s) => [s.id, s.name]));
  return [
    "LISTENING TRANSCRIPT (you heard this once):",
    ...d.segments.flatMap((s) => s.lines.map((l) => `${l.speaker === "NARRATOR" ? "Narrator" : (names.get(l.speaker) ?? l.speaker)}: ${l.text}`)),
    d.map ? `\nMAP (12×8 grid; lettered places are options): ${JSON.stringify(d.map)}` : "",
    "",
    "QUESTIONS",
    groupsForCandidate(d.groups),
  ].join("\n");
}

/* ───────────── juez ───────────── */

export const JUDGE_SYSTEM = `You are a strict reviewer of IELTS Academic practice material. Score the block against the real computer-delivered IELTS Academic test.
Scores 0–10: authenticity (format, style and task design like the real test), levelFit (matches the target band), clarity (unambiguous items with exactly one correct answer; for writing/speaking, a clear task), fairness (no cultural bias, local knowledge, sensitive or distressing content, factual errors).
overall is your overall verdict 0–10 (below 7 = not publishable). estimatedBand is the band of a candidate who would get about 60–70% of it right (for writing/speaking, the band level the task suits).
List concrete problems (in English). Return ONLY JSON.`;

const JUDGE_SYSTEM_DE = `You are a strict reviewer of German practice material for the Goethe-Zertifikat and TestDaF. Score the block against the real exam format and the CEFR level.
Scores 0–10: authenticity (format, style and task design like the real exam), levelFit (matches the CEFR level), clarity (unambiguous items with exactly one correct answer; for writing/speaking, a clear task), fairness (no cultural bias, local knowledge, sensitive content, factual errors; correct German).
overall is your overall verdict 0–10 (below 7 = not publishable). estimatedBand: the IELTS-equivalent band of a candidate who would get about 60–70% right (B1 = 4.5, B2 = 6, C1 = 7.5).
List concrete problems (in English). Return ONLY JSON.`;

export function judgeSystem(exam: ExamCode): string {
  return exam === "IELTS_ACADEMIC" ? JUDGE_SYSTEM : JUDGE_SYSTEM_DE;
}

export function judgePrompt(block: AnyBlock, targetBand: number, partTitle: string): string {
  return [`Block kind: ${block.kind}. Exam part: ${partTitle}. Target band: ${targetBand}.`, "Block (with answer key):", JSON.stringify(block.data)].join("\n");
}
