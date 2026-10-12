/**
 * Instrucciones del calificador de Writing IELTS. Resumen propio de los criterios
 * publicos de banda (no es una copia de los descriptores oficiales). Si cambias el
 * texto, sube WRITING_RUBRIC_VERSION: cada calificacion guarda la version usada.
 */
export const WRITING_RUBRIC_VERSION = "ielts-writing-2026-10-v2";

const CRITERIA = `Score each criterion with a whole band 0–9.

TA (Task 1: Task Achievement / Task 2: Task Response)
 9: fully addresses every part; Task 1 gives a clear, well-selected overview with all key features accurately presented; Task 2 has a fully developed position with relevant, extended, well-supported ideas.
 7: covers the requirements; Task 1 has a clear overview and highlights key features (could be more extended); Task 2 has a clear position throughout with main ideas extended and supported, though some may over-generalise.
 6: addresses the task, but some parts more fully than others; Task 1 has an overview but details may be inappropriate or inaccurate; Task 2 has a relevant position although conclusions may be unclear or repetitive, ideas insufficiently developed.
 5: addresses the task only partially; Task 1 recounts detail mechanically without a clear overview, may contain inaccurate data; Task 2 position is unclear at times, ideas limited and not well developed.
 4: responds only minimally or tangentially; key features/ideas missing or irrelevant.
 Under-length answers (fewer than the required words) lose marks here. Memorised or off-topic text scores very low.

CC (Coherence and Cohesion)
 9: cohesion attracts no attention; paragraphing skilful.
 7: logical organisation with clear progression; a range of cohesive devices used appropriately with some under/over-use; clear central topic in each paragraph.
 6: coherent overall; cohesive devices effective but sometimes faulty or mechanical; referencing not always clear; paragraphing not always logical.
 5: some organisation but lacks overall progression; inadequate, inaccurate or over-used linking; repetitive; paragraphing may be inadequate.
 4: information not arranged coherently; basic or inaccurate linking.

LR (Lexical Resource)
 9: wide, natural and sophisticated vocabulary; rare minor slips.
 7: sufficient range for flexibility and precision; some less common items, awareness of style and collocation; occasional errors in word choice, spelling or word formation.
 6: adequate range; attempts less common vocabulary with some inaccuracy; errors in spelling/word formation that do not impede communication.
 5: limited range, minimally adequate; noticeable errors in spelling/word formation that may cause some difficulty.
 4: basic vocabulary used repetitively; errors may strain the reader.

GRA (Grammatical Range and Accuracy)
 9: wide range of structures with full flexibility and accuracy.
 7: variety of complex structures; frequent error-free sentences; good control with a few errors.
 6: mix of simple and complex forms; some errors in grammar and punctuation that rarely reduce communication.
 5: limited range; complex sentences attempted but less accurate than simple ones; frequent errors may cause some difficulty.
 4: very limited range; errors predominate.`;

export const WRITING_GRADER_SYSTEM = `You are an experienced, certified IELTS Academic Writing examiner. Grade exactly as an official examiner would: strictly, consistently and without generosity.
${CRITERIA}
Write every comment in neutral, encouraging Spanish with correct accents (á, é, í, ó, ú, ñ) — the learner speaks Spanish —, quoting the learner's own words when useful.
Return ONLY JSON.`;

export interface WritingTaskContext {
  task: 1 | 2;
  prompt: string;
  minWords: number;
  /** datos del grafico (Task 1) */
  chart?: unknown;
  /** notas del examinador: rasgos o ideas clave esperados */
  examinerNotes: string[];
  text: string;
  words: number;
}

export function writingGradePrompt(c: WritingTaskContext, withFeedback: boolean): string {
  return [
    `IELTS Academic Writing Task ${c.task}. Minimum length: ${c.minWords} words. The candidate wrote ${c.words} words.`,
    "TASK:",
    c.prompt,
    c.chart ? `\nDATA SHOWN IN THE CHART (exact figures): ${JSON.stringify(c.chart)}` : "",
    `\nEXAMINER NOTES (${c.task === 1 ? "key features a good overview mentions" : "ideas a strong answer could develop"}): ${c.examinerNotes.join(" | ")}`,
    "\nCANDIDATE RESPONSE:",
    '"""',
    c.text,
    '"""',
    withFeedback
      ? [
          "",
          "Also give feedback for the learner:",
          "- overviewEs: 2–4 sentences in Spanish on what to improve first.",
          "- errors: up to 15 concrete errors. quote = the exact words copied from the response; correction = the corrected words; explanationEs = short reason in Spanish.",
          "- improvedVersion: the learner's response rewritten one band higher, keeping their ideas and structure.",
          "- nextStepsEs: up to 4 short, practical study actions in Spanish.",
        ].join("\n")
      : "",
  ].join("\n");
}
