/**
 * Planificador de estudio (codigo puro y determinista: se prueba sin base de datos).
 * Reparte las horas de cada semana segun la brecha entre la nota actual y la meta de
 * cada seccion, y dentro de cada seccion segun los tipos de pregunta mas debiles.
 * Programa simulacros cada 3 semanas y uno final unos dias antes del examen.
 */
import { TASK_TYPE_ES } from "@/lib/exams/labels";

export type StudySection = "LISTENING" | "READING" | "WRITING" | "SPEAKING";
export const STUDY_SECTIONS: StudySection[] = ["LISTENING", "READING", "WRITING", "SPEAKING"];
export type ItemKind = "DRILL" | "PART" | "SECTION" | "WRITING" | "SPEAKING" | "MOCK" | "VOCAB" | "TUTOR";

export interface PlanInput {
  today: Date;
  examDate: Date | null;
  hoursPerWeek: number;
  /** dias disponibles: 0 = domingo … 6 = sabado */
  days: number[];
  target: number;
  sectionTargets?: Partial<Record<StudySection, number>>;
  current: Record<StudySection, number | null>;
  /** dominio por tipo de pregunta (0–1) en Listening y Reading */
  taskMastery: { section: "LISTENING" | "READING"; taskType: string; value: number; n: number }[];
  /** tipos de pregunta de cada seccion (de la especificacion del examen) */
  taskTypes: Record<"LISTENING" | "READING", string[]>;
  mocksAvailable: number;
  hasTutorMinutes: boolean;
  /** horas de estudio para subir una banda (supuesto configurable) */
  hoursPerBand: number;
  /** semanas a planear si no hay fecha de examen */
  defaultWeeks: number;
}

export interface PlannedItem {
  weekStart: Date;
  dueDate: Date;
  kind: ItemKind;
  section: StudySection | null;
  taskType: string | null;
  part: number | null;
  minutes: number;
  title: string;
}

export interface PlanResult {
  items: PlannedItem[];
  weeks: number;
  currentOverall: number | null;
  projectedOverall: number | null;
  warning: string | null;
}

const DAY = 86_400_000;
const MOCK_MINUTES = 165;
const SECTION_ES: Record<StudySection, string> = { LISTENING: "Listening", READING: "Reading", WRITING: "Writing", SPEAKING: "Speaking" };

/** Lunes 00:00 UTC de la semana de `d`. */
export function weekStartOf(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // lunes = 0
  return new Date(x.getTime() - dow * DAY);
}

const half = (v: number) => Math.floor(v * 2 + 1e-9) / 2;

export function overallOf(c: Record<StudySection, number | null>): number | null {
  const v = STUDY_SECTIONS.map((s) => c[s]);
  if (v.some((x) => x === null)) return null;
  const avg = (v as number[]).reduce((a, b) => a + b, 0) / 4;
  return Math.floor(avg * 2 + 0.5 + 1e-9) / 2;
}

export function buildPlan(input: PlanInput): PlanResult {
  const today = new Date(Date.UTC(input.today.getUTCFullYear(), input.today.getUTCMonth(), input.today.getUTCDate()));
  const firstWeek = weekStartOf(today);
  const weeks = input.examDate
    ? Math.min(26, Math.max(1, Math.ceil((weekStartOf(input.examDate).getTime() - firstWeek.getTime()) / (7 * DAY)) + 1))
    : input.defaultWeeks;
  const days = input.days.length ? [...new Set(input.days)].sort() : [1, 3, 5];
  const weekly = Math.max(60, Math.round(input.hoursPerWeek * 60));

  // Simulacros: cada 3 semanas y uno final 5–7 dias antes del examen, sin pasar del cupo.
  const mockWeeks = new Set<number>();
  for (let w = 2; w < weeks; w += 3) mockWeeks.add(w);
  if (input.examDate) {
    const finalWeek = Math.floor((weekStartOf(new Date(input.examDate.getTime() - 6 * DAY)).getTime() - firstWeek.getTime()) / (7 * DAY));
    if (finalWeek >= 0 && finalWeek < weeks) {
      mockWeeks.add(finalWeek);
      mockWeeks.delete(finalWeek - 1);
    }
  }
  const allowedMocks = [...mockWeeks].sort((a, b) => b - a).slice(0, Math.max(0, input.mocksAvailable));
  const mocks = new Set(allowedMocks);

  // Peso de cada seccion = brecha con su meta (sin nota: se asume una banda por debajo).
  const gaps = Object.fromEntries(
    STUDY_SECTIONS.map((s) => {
      const target = input.sectionTargets?.[s] ?? input.target;
      const cur = input.current[s] ?? target - 1;
      return [s, Math.max(0.25, target - cur)];
    }),
  ) as Record<StudySection, number>;
  const gapSum = STUDY_SECTIONS.reduce((a, s) => a + gaps[s], 0);

  const weakest = (section: "LISTENING" | "READING") => {
    const known = new Map(input.taskMastery.filter((m) => m.section === section).map((m) => [m.taskType, m]));
    return [...input.taskTypes[section]].sort((a, b) => {
      const ma = known.get(a);
      const mb = known.get(b);
      // sin practicar primero, luego el dominio mas bajo
      return (ma ? ma.value + 1 : 0) - (mb ? mb.value + 1 : 0);
    });
  };

  const items: PlannedItem[] = [];
  for (let w = 0; w < weeks; w++) {
    const weekStart = new Date(firstWeek.getTime() + w * 7 * DAY);
    const weekDays = days
      .map((d) => new Date(weekStart.getTime() + ((d + 6) % 7) * DAY))
      .filter((d) => d.getTime() >= today.getTime() && (!input.examDate || d.getTime() < input.examDate.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    if (!weekDays.length) continue;
    let slot = 0;
    const due = () => weekDays[slot++ % weekDays.length];
    const push = (it: Omit<PlannedItem, "weekStart" | "dueDate">) => items.push({ ...it, weekStart, dueDate: due() });

    let budget = weekly;
    const vocab = Math.min(10 * weekDays.length, Math.round(budget * 0.15));
    push({ kind: "VOCAB", section: null, taskType: null, part: null, minutes: vocab, title: "Repaso de vocabulario: 10 minutos cada día de estudio" });
    budget -= vocab;
    if (mocks.has(w)) {
      push({ kind: "MOCK", section: null, taskType: null, part: null, minutes: MOCK_MINUTES, title: "Simulacro completo" });
      budget -= MOCK_MINUTES;
    }
    if (budget < 10) continue;

    for (const s of STUDY_SECTIONS) {
      let m = Math.round((budget * gaps[s]) / gapSum);
      if (s === "LISTENING" || s === "READING") {
        const full = s === "LISTENING" ? 30 : 60;
        if (w % 2 === 1 && m >= full + 15) {
          push({ kind: "SECTION", section: s, taskType: null, part: null, minutes: full, title: `${SECTION_ES[s]} completo cronometrado` });
          m -= full;
        } else if (m >= 35) {
          const part = (w % (s === "LISTENING" ? 4 : 3)) + 1;
          push({ kind: "PART", section: s, taskType: null, part, minutes: 20, title: `${SECTION_ES[s]}: ${s === "LISTENING" ? "Part" : "Passage"} ${part}` });
          m -= 20;
        }
        const types = weakest(s);
        let i = w % Math.max(1, Math.min(3, types.length));
        while (m >= 10 && types.length) {
          const t = types[i % Math.min(types.length, 3)];
          push({ kind: "DRILL", section: s, taskType: t, part: null, minutes: 15, title: `${TASK_TYPE_ES[t] ?? t} · ${SECTION_ES[s]}` });
          m -= 15;
          i++;
        }
      } else if (s === "WRITING") {
        let task = w % 2 === 0 ? 2 : 1;
        while (m >= 25) {
          const minutes = task === 1 ? 30 : 50;
          push({ kind: "WRITING", section: s, taskType: null, part: task, minutes, title: task === 1 ? "Writing Task 1 con reescritura" : "Writing Task 2 con reescritura" });
          m -= minutes;
          task = task === 1 ? 2 : 1;
        }
      } else {
        if (input.hasTutorMinutes && m >= 15) {
          push({ kind: "TUTOR", section: s, taskType: null, part: null, minutes: 15, title: "Clase con tu tutor: respuestas largas de Speaking" });
          m -= 15;
        }
        let part = (w % 3) + 1;
        while (m >= 10) {
          push({ kind: "SPEAKING", section: s, taskType: null, part, minutes: 15, title: `Speaking Part ${part} con examinador por voz` });
          m -= 15;
          part = (part % 3) + 1;
        }
      }
    }
  }

  const currentOverall = overallOf(input.current);
  const totalHours = (weekly / 60) * weeks;
  const projectedOverall = currentOverall !== null ? Math.min(9, half(currentOverall + totalHours / input.hoursPerBand)) : null;
  let warning: string | null = null;
  if (projectedOverall !== null && projectedOverall < input.target) {
    const neededHours = (input.target - currentOverall!) * input.hoursPerBand;
    const perWeek = Math.ceil(neededHours / weeks);
    const weeksAtCurrent = Math.ceil(neededHours / (weekly / 60));
    warning = `Con ${input.hoursPerWeek} h por semana la proyección es banda ${projectedOverall.toFixed(1)}. Para llegar a ${input.target.toFixed(1)} necesitarías unas ${perWeek} h por semana o unas ${weeksAtCurrent} semanas de estudio.`;
  }
  return { items, weeks, currentOverall, projectedOverall, warning };
}
