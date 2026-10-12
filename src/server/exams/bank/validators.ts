/**
 * Validacion con codigo de los bloques generados (antes del resolutor y el juez).
 * Devuelve problemas en ingles: se le envian tal cual a la IA para que corrija.
 */
import type { PartSpec, SectionSpec } from "@/content/exams/types";
import { countWords, positionOf, textContains } from "@/server/exams/scoring/objective";

import {
  COMPLETION_TYPES,
  JUDGEMENT_ANSWERS,
  SHARED_OPTION_TYPES,
  allQuestions,
  type AnyBlock,
  type ListeningBlock,
  type QuestionGroup,
  type ReadingBlock,
} from "./schemas";
import { firstQuestionNumber } from "./targets";

/** Tolerancia sobre la extension pedida (±15 %). */
const LENGTH_TOLERANCE = 0.15;

export function validateBlock(block: AnyBlock, section: SectionSpec, part: PartSpec): string[] {
  switch (block.kind) {
    case "reading":
      return validateReading(block.data, section, part);
    case "listening":
      return validateListening(block.data, section, part);
    case "writing1": {
      const d = block.data;
      const issues: string[] = [];
      if (part.minWords && !d.prompt.includes(String(part.minWords))) issues.push(`The prompt must say "Write at least ${part.minWords} words."`);
      issues.push(...validateChart(d.chart));
      if (part.minWords && countWords(d.modelAnswer) < part.minWords) issues.push(`modelAnswer must have at least ${part.minWords} words.`);
      return issues;
    }
    case "writing2": {
      const d = block.data;
      const issues: string[] = [];
      if (part.minWords && !d.prompt.includes(String(part.minWords))) issues.push(`The prompt must say "Write at least ${part.minWords} words."`);
      if (part.minWords && countWords(d.modelAnswer) < part.minWords) issues.push(`modelAnswer must have at least ${part.minWords} words.`);
      return issues;
    }
    case "speaking1":
      return block.data.frames.flatMap((f, i) => (f.questions.some((q) => !q.trim().endsWith("?")) ? [`frames[${i}]: every question must end with "?".`] : []));
    case "speaking2": {
      const d = block.data;
      const issues: string[] = [];
      if (!/^describe\b/i.test(d.card.task.trim())) issues.push('card.task must start with "Describe".');
      if (d.discussion.flatMap((x) => x.questions).some((q) => !q.trim().endsWith("?"))) issues.push('Every discussion question must end with "?".');
      return issues;
    }
  }
}

function checkLength(words: number, range: [number, number] | undefined, what: string): string[] {
  if (!range) return [];
  const lo = Math.floor(range[0] * (1 - LENGTH_TOLERANCE));
  const hi = Math.ceil(range[1] * (1 + LENGTH_TOLERANCE));
  if (words < lo) return [`The ${what} has ${words} words; it needs ${range[0]}–${range[1]}. Make it longer.`];
  if (words > hi) return [`The ${what} has ${words} words; it needs ${range[0]}–${range[1]}. Make it shorter.`];
  return [];
}

function readingText(d: ReadingBlock): string {
  return d.passage.paragraphs.map((p) => p.text).join("\n\n");
}

function validateReading(d: ReadingBlock, section: SectionSpec, part: PartSpec): string[] {
  const issues: string[] = [];
  const text = readingText(d);
  issues.push(...checkLength(countWords(text), part.words, "passage"));
  const labels = d.passage.paragraphs.map((p) => p.label);
  const expected = labels.map((_, i) => String.fromCharCode(65 + i));
  if (labels.join() !== expected.join()) issues.push(`Paragraph labels must be ${expected.join(", ")} in order.`);
  issues.push(...validateGroups(d.groups, text, section, part));
  const headings = d.groups.find((g) => g.taskType === "MATCHING_HEADINGS");
  if (headings) {
    for (const q of headings.questions)
      if (!labels.some((l) => new RegExp(`\\b${l}\\b`).test(q.prompt)))
        issues.push(`Q${q.number}: a heading question must name the paragraph (e.g. "Paragraph B").`);
  }
  return issues;
}

/** Texto de los hablantes (sin el narrador): ahi deben estar las respuestas. */
export function listeningText(d: ListeningBlock, segmentIndex?: number): string {
  const segs = segmentIndex === undefined ? d.segments : [d.segments[segmentIndex]];
  return segs
    .flatMap((s) => s.lines)
    .filter((l) => l.speaker !== "NARRATOR")
    .map((l) => l.text)
    .join("\n");
}

function validateListening(d: ListeningBlock, section: SectionSpec, part: PartSpec): string[] {
  const issues: string[] = [];
  const all = d.segments.flatMap((s) => s.lines);
  issues.push(...checkLength(countWords(all.map((l) => l.text).join(" ")), part.words, "transcript"));

  const ids = d.speakers.map((s) => s.id);
  if (new Set(ids).size !== ids.length) issues.push("Speaker ids must be unique.");
  if (ids.includes("NARRATOR")) issues.push("NARRATOR is reserved; do not list it in speakers.");
  const wanted = part.speakers ?? 1;
  const n = d.speakers.length;
  if (wanted <= 2 && n !== wanted) issues.push(`This part needs exactly ${wanted} speaker(s); there are ${n}.`);
  if (wanted >= 3 && (n < 2 || n > 4)) issues.push(`This part needs 2–4 speakers; there are ${n}.`);
  const unknown = [...new Set(all.map((l) => l.speaker).filter((s) => s !== "NARRATOR" && !ids.includes(s)))];
  if (unknown.length) issues.push(`Lines use unknown speaker ids: ${unknown.join(", ")}.`);
  for (const id of ids) if (!all.some((l) => l.speaker === id)) issues.push(`Speaker ${id} never speaks.`);

  const start = firstQuestionNumber(section, part.part);
  const end = start + part.items - 1;
  const segs = d.segments;
  if (segs[0]?.questionsFrom !== start) issues.push(`The first segment must start at question ${start}.`);
  if (segs[segs.length - 1]?.questionsTo !== end) issues.push(`The last segment must end at question ${end}.`);
  for (let i = 1; i < segs.length; i++)
    if (segs[i].questionsFrom !== segs[i - 1].questionsTo + 1) issues.push("Segments must cover consecutive question ranges.");

  const text = listeningText(d);
  issues.push(...validateGroups(d.groups, text, section, part));

  // Cada respuesta debe oirse en el tramo de audio que le corresponde y en orden.
  const questions = allQuestions(d.groups);
  segs.forEach((seg, si) => {
    const segText = listeningText(d, si);
    let last = -1;
    for (const q of questions.filter((x) => x.number >= seg.questionsFrom && x.number <= seg.questionsTo)) {
      const ev = evidencePieces(q.evidence)[0];
      if (!ev) continue;
      const pos = positionOf(segText, ev);
      if (pos < 0) {
        if (textContains(text, ev)) issues.push(`Q${q.number}: its evidence is spoken in the wrong segment (questions ${seg.questionsFrom}–${seg.questionsTo}).`);
        continue;
      }
      if (pos < last) issues.push(`Q${q.number}: answers must be heard in question order (it is heard before Q${q.number - 1}).`);
      last = Math.max(last, pos);
    }
  });

  const mapGroup = d.groups.find((g) => g.taskType === "MAP_LABELLING");
  if (mapGroup) {
    if (!d.map) issues.push("MAP_LABELLING needs a map.");
    else {
      const keys = new Set(d.map.places.map((p) => p.key).filter(Boolean));
      for (const o of mapGroup.sharedOptions ?? []) if (!keys.has(o.key)) issues.push(`Map letter ${o.key} is missing from map.places.`);
      if (!d.map.places.some((p) => p.name)) issues.push("The map needs at least one named landmark for orientation.");
    }
  }
  return issues;
}

/** La evidencia puede venir cortada con "…": cada tramo se busca por separado. */
function evidencePieces(evidence: string): string[] {
  return evidence
    .split(/\.{3}|…/)
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => s.split(/\s+/).length >= 2);
}

function validateGroups(groups: QuestionGroup[], source: string, section: SectionSpec, part: PartSpec): string[] {
  const issues: string[] = [];
  const questions = allQuestions(groups);
  const start = firstQuestionNumber(section, part.part);
  const numbers = questions.map((q) => q.number);
  const expected = Array.from({ length: part.items }, (_, i) => start + i);
  if (numbers.join() !== expected.join())
    issues.push(`There must be exactly ${part.items} questions numbered ${start}–${start + part.items - 1}; got ${numbers.length} (${numbers.join(", ")}).`);

  const prompts = new Set<string>();
  for (const g of groups) {
    if (!part.taskTypes.includes(g.taskType)) issues.push(`Task type ${g.taskType} is not allowed here. Use: ${part.taskTypes.join(", ")}.`);
    const isShared = SHARED_OPTION_TYPES.includes(g.taskType);
    const isCompletion = COMPLETION_TYPES.includes(g.taskType);
    const judgement = JUDGEMENT_ANSWERS[g.taskType];

    if (isShared) {
      const opts = g.sharedOptions ?? [];
      if (opts.length < 3) issues.push(`${g.taskType} group needs sharedOptions (at least 3).`);
      if (new Set(opts.map((o) => o.key)).size !== opts.length) issues.push(`${g.taskType}: option keys must be unique.`);
      if (new Set(opts.map((o) => o.text.toLowerCase())).size !== opts.length) issues.push(`${g.taskType}: option texts must be unique.`);
      if (g.taskType === "MATCHING_HEADINGS" && opts.length <= g.questions.length)
        issues.push("MATCHING_HEADINGS needs more headings than paragraphs to match.");
    } else if (g.sharedOptions?.length) {
      issues.push(`${g.taskType} must not have sharedOptions.`);
    }
    if (isCompletion && !g.wordLimit) issues.push(`${g.taskType} needs wordLimit (e.g. NO MORE THAN TWO WORDS).`);
    if (isCompletion && g.wordLimit && !/\b(ONE|TWO|THREE|FOUR)\s+WORDS?\b/i.test(g.instructions))
      issues.push(`${g.taskType}: instructions must state the word limit in capitals (e.g. NO MORE THAN TWO WORDS).`);
    if (judgement && g.questions.length >= 4) {
      const counts = new Map<string, number>();
      for (const q of g.questions) counts.set(q.answers[0], (counts.get(q.answers[0]) ?? 0) + 1);
      if (counts.size < 2) issues.push(`${g.taskType}: answers must not all be the same.`);
      if (g.questions.length >= 5 && Math.max(...counts.values()) > Math.ceil(g.questions.length * 0.6))
        issues.push(`${g.taskType}: balance the answers (no single answer above 60%).`);
    }

    for (const q of g.questions) {
      const tag = `Q${q.number}`;
      const key = q.prompt.trim().toLowerCase();
      if (prompts.has(key)) issues.push(`${tag}: duplicated question.`);
      prompts.add(key);

      if (g.taskType === "MCQ_SINGLE") {
        const opts = q.options ?? [];
        if (opts.length < 3 || opts.length > 5) issues.push(`${tag}: MCQ_SINGLE needs 3–5 options.`);
        if (new Set(opts.map((o) => o.key)).size !== opts.length) issues.push(`${tag}: option keys must be unique.`);
        if (new Set(opts.map((o) => o.text.toLowerCase())).size !== opts.length) issues.push(`${tag}: option texts must be unique.`);
        if (q.answers.length !== 1 || !opts.some((o) => o.key === q.answers[0])) issues.push(`${tag}: the answer must be exactly one option key.`);
      } else if (q.options?.length) {
        issues.push(`${tag}: only MCQ_SINGLE questions have their own options.`);
      }
      if (isShared && (q.answers.length !== 1 || !(g.sharedOptions ?? []).some((o) => o.key === q.answers[0])))
        issues.push(`${tag}: the answer must be exactly one key from sharedOptions.`);
      if (judgement && (q.answers.length !== 1 || !judgement.includes(q.answers[0])))
        issues.push(`${tag}: the answer must be one of ${judgement.join(" / ")}.`);

      if (isCompletion) {
        const gaps = (q.prompt.match(/_{3,}/g) ?? []).length;
        if (g.taskType === "SHORT_ANSWER") {
          if (!q.prompt.trim().endsWith("?")) issues.push(`${tag}: SHORT_ANSWER items are questions ending with "?".`);
        } else if (gaps !== 1) issues.push(`${tag}: completion items need exactly one gap "___".`);
        for (const a of q.answers)
          if (g.wordLimit && countWords(a) > g.wordLimit) issues.push(`${tag}: answer "${a}" exceeds the ${g.wordLimit}-word limit.`);
        if (!textContains(source, q.answers[0]))
          issues.push(`${tag}: the answer "${q.answers[0]}" must appear word for word in the ${section.section === "LISTENING" ? "transcript" : "passage"}.`);
      }

      const notGiven = q.answers[0] === "NOT GIVEN";
      if (!notGiven) {
        const pieces = evidencePieces(q.evidence);
        if (!pieces.length || pieces.some((p) => !textContains(source, p)))
          issues.push(`${tag}: "evidence" must be copied word for word from the ${section.section === "LISTENING" ? "transcript" : "passage"}.`);
      }
    }
  }
  return issues;
}

export function validateChart(chart: { kind: string; unit: string; categories: string[]; series: { name: string; values: number[] }[] }): string[] {
  const issues: string[] = [];
  for (const s of chart.series) {
    if (s.values.length !== chart.categories.length) issues.push(`Series "${s.name}" needs ${chart.categories.length} values (one per category).`);
    if (s.values.some((v) => !Number.isFinite(v))) issues.push(`Series "${s.name}" has invalid numbers.`);
    if (chart.kind !== "line" && s.values.some((v) => v < 0)) issues.push(`Series "${s.name}" must not have negative values.`);
  }
  if (chart.kind === "pie") {
    if (chart.series.length > 3) issues.push("A pie chart task has at most 3 pies (series).");
    if (chart.unit.includes("%"))
      for (const s of chart.series) {
        const sum = s.values.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > 1) issues.push(`Pie "${s.name}" must add up to 100% (it adds up to ${sum}).`);
      }
  }
  return issues;
}
