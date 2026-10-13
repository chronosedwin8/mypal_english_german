import type { ExamSpec, PartSpec, SectionSpec } from "./types";

/**
 * Goethe-Zertifikat B1, B2 y C1 (formato segun Durchführungsbestimmungen y Modellsätze).
 * Lesen y Hören: 30 items de 1 punto, convertidos a 100. Aprobado con 60 por modulo.
 */
const DISCLAIMER =
  "Preparación independiente para el Goethe-Zertifikat. No estamos afiliados al Goethe-Institut. La nota es una estimación, no un resultado oficial.";

function hoeren(parts: PartSpec[]): SectionSpec {
  return { section: "LISTENING", name: "Hören", minutes: 40, reviewMinutes: 5, rawMax: 30, parts };
}

function lesen(parts: PartSpec[]): SectionSpec {
  return { section: "READING", name: "Lesen", minutes: 65, rawMax: 30, parts };
}

export const GOETHE_B2: ExamSpec = {
  code: "GOETHE_B2",
  name: "Goethe-Zertifikat B2",
  shortName: "Goethe B2",
  language: "de",
  profiles: ["DE"],
  purposeEs: "Estudios y trabajo calificado en países de habla alemana que piden B2.",
  levelEs: "B2",
  scaleEs: "0–100 por módulo, aprobado con 60",
  cefr: "B2",
  mockOrder: ["READING", "LISTENING", "WRITING", "SPEAKING"],
  breakMinutes: 15,
  disclaimerEs: DISCLAIMER,
  sections: [
    lesen([
      { part: 1, title: "Teil 1", description: "Forum posts: match statements to people.", taskTypes: ["MATCHING"], items: 9, minutes: 18, words: [450, 600] },
      { part: 2, title: "Teil 2", description: "Newspaper article with removed sentences to insert.", taskTypes: ["SENTENCE_INSERTION"], items: 6, minutes: 12, words: [450, 550] },
      { part: 3, title: "Teil 3", description: "Article with multiple-choice questions.", taskTypes: ["MCQ_SINGLE"], items: 6, minutes: 12, words: [500, 600] },
      { part: 4, title: "Teil 4", description: "Opinions about a topic: match statements to authors.", taskTypes: ["MATCHING"], items: 6, minutes: 12, words: [400, 500] },
      { part: 5, title: "Teil 5", description: "Regulations or rules: match headings to sections.", taskTypes: ["MATCHING_HEADINGS"], items: 3, minutes: 6, words: [250, 350] },
    ]),
    hoeren([
      { part: 1, title: "Teil 1", description: "Five short dialogues or messages; richtig/falsch and a/b/c alternating.", taskTypes: ["RICHTIG_FALSCH", "MCQ_SINGLE"], items: 10, minutes: 8, plays: 1, speakers: 2, words: [400, 550] },
      { part: 2, title: "Teil 2", description: "Radio interview.", taskTypes: ["MCQ_SINGLE"], items: 6, minutes: 10, plays: 2, speakers: 2, words: [550, 700] },
      { part: 3, title: "Teil 3", description: "Discussion between several people: who says what?", taskTypes: ["WHO_SAYS"], items: 6, minutes: 8, plays: 1, speakers: 3, words: [550, 700] },
      { part: 4, title: "Teil 4", description: "Short lecture or talk.", taskTypes: ["MCQ_SINGLE"], items: 8, minutes: 10, plays: 2, speakers: 1, words: [550, 700] },
    ]),
    {
      section: "WRITING",
      name: "Schreiben",
      minutes: 75,
      rawMax: 100,
      parts: [
        { part: 1, title: "Teil 1", description: "Forum contribution with your opinion on a topic.", taskTypes: ["FORUM_POST"], items: 1, minutes: 50, minWords: 150 },
        { part: 2, title: "Teil 2", description: "Formal message (e.g. to a superior or an institution).", taskTypes: ["FORMAL_MESSAGE"], items: 1, minutes: 25, minWords: 100 },
      ],
    },
    {
      section: "SPEAKING",
      name: "Sprechen",
      minutes: 15,
      rawMax: 100,
      parts: [
        { part: 1, title: "Teil 1", description: "Presentation on a chosen topic, then questions from the partner.", taskTypes: ["SPEAKING_PRESENTATION"], items: 1, minutes: 4, prepSeconds: 900, speakSeconds: 240 },
        { part: 2, title: "Teil 2", description: "Discussion with the partner about a controversial topic.", taskTypes: ["SPEAKING_DISCUSSION"], items: 1, minutes: 5 },
      ],
    },
  ],
};

export const GOETHE_B1: ExamSpec = {
  ...GOETHE_B2,
  code: "GOETHE_B1",
  name: "Goethe-Zertifikat B1",
  shortName: "Goethe B1",
  purposeEs: "Trabajo, formación profesional y trámites que piden B1.",
  levelEs: "B1",
  cefr: "B1",
  sections: [
    lesen([
      { part: 1, title: "Teil 1", description: "Blog or personal text: richtig/falsch.", taskTypes: ["RICHTIG_FALSCH"], items: 6, minutes: 10, words: [250, 350] },
      { part: 2, title: "Teil 2", description: "Two press articles with multiple-choice questions.", taskTypes: ["MCQ_SINGLE"], items: 6, minutes: 20, words: [400, 500] },
      { part: 3, title: "Teil 3", description: "Situations and advertisements: match.", taskTypes: ["MATCHING"], items: 7, minutes: 10, words: [300, 400] },
      { part: 4, title: "Teil 4", description: "Opinions: for or against? (ja/nein).", taskTypes: ["RICHTIG_FALSCH"], items: 7, minutes: 15, words: [400, 500] },
      { part: 5, title: "Teil 5", description: "Rules or instructions: multiple choice.", taskTypes: ["MCQ_SINGLE"], items: 4, minutes: 10, words: [250, 350] },
    ]),
    hoeren([
      { part: 1, title: "Teil 1", description: "Five short texts (announcements, messages), each played twice.", taskTypes: ["RICHTIG_FALSCH", "MCQ_SINGLE"], items: 10, minutes: 10, plays: 2, speakers: 1, words: [300, 450] },
      { part: 2, title: "Teil 2", description: "Guided tour or presentation.", taskTypes: ["MCQ_SINGLE"], items: 5, minutes: 7, plays: 1, speakers: 1, words: [350, 450] },
      { part: 3, title: "Teil 3", description: "Everyday conversation: richtig/falsch.", taskTypes: ["RICHTIG_FALSCH"], items: 7, minutes: 8, plays: 1, speakers: 2, words: [400, 500] },
      { part: 4, title: "Teil 4", description: "Radio discussion: who says what?", taskTypes: ["WHO_SAYS"], items: 8, minutes: 10, plays: 2, speakers: 3, words: [450, 600] },
    ]),
    {
      section: "WRITING",
      name: "Schreiben",
      minutes: 60,
      rawMax: 100,
      parts: [
        { part: 1, title: "Teil 1", description: "Informal email to a friend.", taskTypes: ["FORMAL_MESSAGE"], items: 1, minutes: 20, minWords: 80 },
        { part: 2, title: "Teil 2", description: "Forum post with your opinion.", taskTypes: ["FORUM_POST"], items: 1, minutes: 25, minWords: 80 },
        { part: 3, title: "Teil 3", description: "Short formal message (apology, request).", taskTypes: ["FORMAL_MESSAGE"], items: 1, minutes: 15, minWords: 40 },
      ],
    },
    {
      section: "SPEAKING",
      name: "Sprechen",
      minutes: 15,
      rawMax: 100,
      parts: [
        { part: 1, title: "Teil 1", description: "Plan something together with the partner.", taskTypes: ["SPEAKING_DISCUSSION"], items: 1, minutes: 3 },
        { part: 2, title: "Teil 2", description: "Present a topic (with slides).", taskTypes: ["SPEAKING_PRESENTATION"], items: 1, minutes: 4, prepSeconds: 900, speakSeconds: 180 },
        { part: 3, title: "Teil 3", description: "Respond to the partner's presentation and answer questions.", taskTypes: ["SPEAKING_INTERVIEW"], items: 1, minutes: 2 },
      ],
    },
  ],
};

export const GOETHE_C1: ExamSpec = {
  ...GOETHE_B2,
  code: "GOETHE_C1",
  name: "Goethe-Zertifikat C1",
  shortName: "Goethe C1",
  purposeEs: "Estudios universitarios y trabajo donde se acepta C1.",
  levelEs: "C1",
  cefr: "C1",
  sections: [
    lesen([
      { part: 1, title: "Teil 1", description: "Literary or popular-science text with gap fill.", taskTypes: ["GAP_FILL"], items: 10, minutes: 15, words: [550, 700] },
      { part: 2, title: "Teil 2", description: "Article: multiple choice.", taskTypes: ["MCQ_SINGLE"], items: 6, minutes: 20, words: [700, 850] },
      { part: 3, title: "Teil 3", description: "Several short texts: match statements.", taskTypes: ["MATCHING"], items: 8, minutes: 15, words: [550, 700] },
      { part: 4, title: "Teil 4", description: "Academic text: sentence completion.", taskTypes: ["SENTENCE_COMPLETION"], items: 6, minutes: 15, words: [550, 700] },
    ]),
    hoeren([
      { part: 1, title: "Teil 1", description: "Phone message or conversation: note completion.", taskTypes: ["NOTE_COMPLETION"], items: 7, minutes: 8, plays: 1, speakers: 2, words: [350, 450] },
      { part: 2, title: "Teil 2", description: "Radio interview: multiple choice.", taskTypes: ["MCQ_SINGLE"], items: 10, minutes: 12, plays: 2, speakers: 2, words: [700, 850] },
      { part: 3, title: "Teil 3", description: "Five short statements by different people: match.", taskTypes: ["MATCHING"], items: 5, minutes: 8, plays: 2, speakers: 3, words: [400, 500] },
      { part: 4, title: "Teil 4", description: "Lecture: note completion.", taskTypes: ["NOTE_COMPLETION"], items: 8, minutes: 12, plays: 2, speakers: 1, words: [700, 900] },
    ]),
    {
      section: "WRITING",
      name: "Schreiben",
      minutes: 75,
      rawMax: 100,
      parts: [
        { part: 1, title: "Teil 1", description: "Argumentative text on a social topic using a graph.", taskTypes: ["ESSAY"], items: 1, minutes: 65, minWords: 230 },
        { part: 2, title: "Teil 2", description: "Formal letter or email correcting/reformulating.", taskTypes: ["FORMAL_MESSAGE"], items: 1, minutes: 10, minWords: 100 },
      ],
    },
    {
      section: "SPEAKING",
      name: "Sprechen",
      minutes: 20,
      rawMax: 100,
      parts: [
        { part: 1, title: "Teil 1", description: "Presentation on a topic (about 4 minutes) and questions.", taskTypes: ["SPEAKING_PRESENTATION"], items: 1, minutes: 8, prepSeconds: 1200, speakSeconds: 240 },
        { part: 2, title: "Teil 2", description: "Discussion with the partner to reach a decision.", taskTypes: ["SPEAKING_DISCUSSION"], items: 1, minutes: 6 },
      ],
    },
  ],
};
