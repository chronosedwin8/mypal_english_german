/**
 * Guion del examinador de IELTS Speaking (sin base de datos ni red: se prueba solo).
 * Partes 1 y 2 siguen preguntas preparadas del banco; en la Parte 3 la IA puede hacer
 * una pregunta de seguimiento, como un examinador real.
 */

export interface ExaminerTurn {
  kind: "examiner";
  text: string;
  /** que se espera despues: respuesta normal, tarjeta de la Parte 2 o fin de la parte */
  expects: "answer" | "longturn" | "end";
  audioKey?: string;
}
export interface CandidateTurn {
  kind: "candidate";
  audioKey: string;
  transcript: string;
  durationMs: number;
  words: { text: string; start: number; end: number }[];
}
export type SpeakingTurn = ExaminerTurn | CandidateTurn;

export interface Part1Content {
  frames: { topic: string; questions: string[] }[];
}
export interface Part2Content {
  card: { task: string; cuePoints: string[]; finalLine: string };
  roundingOff: string[];
  discussion: { theme: string; questions: string[] }[];
}

export interface ScriptLimits {
  part1Questions: number;
  part3Questions: number;
}

/** Preguntas de la Parte 1 en orden, con la transicion al cambiar de tema. */
export function part1Lines(content: Part1Content, examinerName: string, limit: number): string[] {
  const lines: string[] = [];
  content.frames.forEach((f, fi) => {
    f.questions.forEach((q, qi) => {
      if (fi === 0 && qi === 0)
        lines.push(`Good morning. My name is ${examinerName} and I'm your examiner today. In this first part, I'd like to ask you some questions about yourself. Let's talk about ${f.topic.toLowerCase()}. ${q}`);
      else if (qi === 0) lines.push(`Now let's talk about ${f.topic.toLowerCase()}. ${q}`);
      else lines.push(q);
    });
  });
  return lines.slice(0, Math.max(1, limit));
}

export const PART2_INTRO =
  "Now I'm going to give you a topic and I'd like you to talk about it for one to two minutes. Before you talk, you'll have one minute to think about what you're going to say. You can make some notes if you wish. Here is your topic.";

export function part3Intro(cardTask: string, theme: string, question: string): string {
  const topic = cardTask.replace(/^describe\s+/i, "").replace(/\.$/, "");
  return `We've been talking about ${topic}, and I'd like to discuss with you one or two more general questions related to this. Let's consider ${theme.toLowerCase()}. ${question}`;
}

export const CLOSING = "Thank you. That is the end of the speaking test.";

/** Preguntas preparadas de la Parte 3, en orden, con transicion entre temas. */
export function part3Prepared(content: Part2Content): string[] {
  const out: string[] = [];
  content.discussion.forEach((d, di) =>
    d.questions.forEach((q, qi) => {
      if (di === 0 && qi === 0) out.push(part3Intro(content.card.task, d.theme, q));
      else if (qi === 0) out.push(`Let's move on to ${d.theme.toLowerCase()}. ${q}`);
      else out.push(q);
    }),
  );
  return out;
}

const candidateCount = (turns: SpeakingTurn[]) => turns.filter((t) => t.kind === "candidate").length;

/**
 * Siguiente linea del examinador para las Partes 1 y 2 (deterministas). Devuelve null
 * cuando la parte termino. La Parte 3 la decide `nextPart3` (puede usar IA).
 */
export function nextScriptedTurn(part: 1 | 2, turns: SpeakingTurn[], ctx: { p1?: Part1Content; p2?: Part2Content; examinerName: string; limits: ScriptLimits }): ExaminerTurn | null {
  const answered = candidateCount(turns);
  if (part === 1) {
    const lines = part1Lines(ctx.p1!, ctx.examinerName, ctx.limits.part1Questions);
    if (answered >= lines.length) return null;
    return { kind: "examiner", text: lines[answered], expects: "answer" };
  }
  // Parte 2: tarjeta (respuesta larga) y una pregunta de cierre.
  if (answered === 0) return { kind: "examiner", text: PART2_INTRO, expects: "longturn" };
  if (answered === 1 && ctx.p2!.roundingOff.length) return { kind: "examiner", text: `Thank you. ${ctx.p2!.roundingOff[0]}`, expects: "answer" };
  return null;
}

/** Medidas de fluidez a partir de las marcas de tiempo de Scribe. */
export function fluencyMetrics(turns: SpeakingTurn[]) {
  const cand = turns.filter((t): t is CandidateTurn => t.kind === "candidate");
  let words = 0;
  let speakingSeconds = 0;
  let longPauses = 0;
  let fillers = 0;
  for (const t of cand) {
    words += t.words.length;
    if (t.words.length) speakingSeconds += t.words[t.words.length - 1].end - t.words[0].start;
    for (let i = 1; i < t.words.length; i++) if (t.words[i].start - t.words[i - 1].end > 1.5) longPauses++;
    fillers += t.words.filter((w) => /^(um+|uh+|er+|erm+|hmm+|ah+|äh+m?|ähm+|öh+)[.,]?$/i.test(w.text)).length;
  }
  const minutes = speakingSeconds / 60;
  return {
    answers: cand.length,
    words,
    speakingSeconds: Math.round(speakingSeconds),
    wordsPerMinute: minutes > 0 ? Math.round(words / minutes) : 0,
    longPausesPerMinute: minutes > 0 ? Number((longPauses / minutes).toFixed(2)) : 0,
    fillersPerMinute: minutes > 0 ? Number((fillers / minutes).toFixed(2)) : 0,
    averageAnswerSeconds: cand.length ? Math.round(cand.reduce((s, t) => s + t.durationMs, 0) / cand.length / 1000) : 0,
  };
}

/* ───────────── Aleman (Goethe, TestDaF): tareas orales genericas ───────────── */

export interface SpeakingTaskContent {
  mode: "presentation" | "discussion" | "planning" | "recorded" | "interview";
  situation: string;
  points: string[];
  partnerView: string | null;
  questions: string[];
}

export type Speaker = "examiner" | "partner";

/**
 * Siguiente linea de una tarea oral en aleman. Presentacion y tarea grabada: un
 * turno largo (y en la presentacion, preguntas despues). Discusion y planificacion:
 * el companero virtual opina y pregunta; la persona responde por turnos.
 */
export function nextTaskTurn(
  part: number,
  task: SpeakingTaskContent,
  turns: SpeakingTurn[],
  limits: { followUps: number },
): (ExaminerTurn & { speaker: Speaker }) | null {
  const answered = turns.filter((t) => t.kind === "candidate").length;
  const intro = `Teil ${part}. ${task.situation}`;
  switch (task.mode) {
    case "recorded":
      return answered === 0 ? { kind: "examiner", text: intro, expects: "longturn", speaker: "examiner" } : null;
    case "presentation": {
      if (answered === 0) return { kind: "examiner", text: intro, expects: "longturn", speaker: "examiner" };
      const q = task.questions[answered - 1];
      return q && answered - 1 < limits.followUps ? { kind: "examiner", text: q, expects: "answer", speaker: "partner" } : null;
    }
    case "discussion":
    case "planning": {
      if (answered === 0)
        return { kind: "examiner", text: `${intro} ${task.partnerView ?? ""} ${task.questions[0] ?? ""}`.trim(), expects: "answer", speaker: "partner" };
      const q = task.questions[answered];
      return q && answered < limits.followUps + 1 ? { kind: "examiner", text: q, expects: "answer", speaker: "partner" } : null;
    }
    default: {
      if (answered === 0) return { kind: "examiner", text: `${intro} ${task.questions[0] ?? ""}`.trim(), expects: "answer", speaker: "examiner" };
      const q = task.questions[answered];
      return q && answered < limits.followUps + 1 ? { kind: "examiner", text: q, expects: "answer", speaker: "examiner" } : null;
    }
  }
}

export const CLOSING_DE = "Vielen Dank. Die Prüfung ist jetzt beendet.";
