/**
 * Motor del test adaptativo (puro, sin base de datos).
 *
 * Modelo 3PL con a = 1 y adivinanza c = 1/opciones:
 *   P(correcto | θ, b) = c + (1 − c) / (1 + e^−(θ − b))
 * Estimacion EAP sobre una malla de θ ∈ [−4, 4] con prior N(−0.5, 1.5²).
 */
import type { CefrLevel, SkillName } from "@/content/diagnostic/types";

export interface IrtItem {
  id: string;
  skill: SkillName;
  difficulty: number;
  optionCount: number;
}

export interface IrtResponse {
  difficulty: number;
  optionCount: number;
  correct: boolean;
}

const GRID: number[] = Array.from({ length: 81 }, (_, i) => -4 + i * 0.1);
const PRIOR_MEAN = -0.5;
const PRIOR_SD = 1.5;

export const TEST_RULES = {
  minItems: 12,
  maxItems: 20,
  targetSe: 0.4,
  /** cuantos items de escucha y lectura como minimo */
  minBySkill: { LISTENING: 2, READING: 1 } as Partial<Record<SkillName, number>>,
};

export function probability(theta: number, difficulty: number, optionCount: number): number {
  const c = 1 / Math.max(2, optionCount);
  return c + (1 - c) / (1 + Math.exp(-(theta - difficulty)));
}

export function information(theta: number, difficulty: number, optionCount: number): number {
  const c = 1 / Math.max(2, optionCount);
  const p = probability(theta, difficulty, optionCount);
  return ((p - c) ** 2 / (1 - c) ** 2) * ((1 - p) / p);
}

export function estimateAbility(responses: IrtResponse[]): { theta: number; se: number } {
  const weights = GRID.map((t) => {
    let w = Math.exp(-0.5 * ((t - PRIOR_MEAN) / PRIOR_SD) ** 2);
    for (const r of responses) {
      const p = probability(t, r.difficulty, r.optionCount);
      w *= r.correct ? p : 1 - p;
    }
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const theta = GRID.reduce((s, t, i) => s + t * weights[i], 0) / total;
  const variance = GRID.reduce((s, t, i) => s + (t - theta) ** 2 * weights[i], 0) / total;
  return { theta, se: Math.sqrt(variance) };
}

/** Cortes de θ a MCER. */
export function levelFromTheta(theta: number): CefrLevel {
  if (theta < -1.65) return "A1";
  if (theta < -0.55) return "A2";
  if (theta < 0.55) return "B1";
  if (theta < 1.65) return "B2";
  return "C1";
}

export const LEVEL_ORDER: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];

export function shouldStop(answered: number, se: number, remainingRequiredSkills: number): boolean {
  if (answered >= TEST_RULES.maxItems) return true;
  return answered >= TEST_RULES.minItems && se <= TEST_RULES.targetSe && remainingRequiredSkills === 0;
}

/** Habilidades minimas que aun faltan por cubrir. */
export function missingSkills(answeredSkills: SkillName[]): SkillName[] {
  const out: SkillName[] = [];
  for (const [skill, min] of Object.entries(TEST_RULES.minBySkill) as [SkillName, number][]) {
    const have = answeredSkills.filter((s) => s === skill).length;
    if (have < min) out.push(skill);
  }
  return out;
}

/**
 * Siguiente pregunta: maxima informacion en θ actual, con rotacion de habilidades
 * (prioriza las que faltan y la menos usada) y algo de azar entre las 3 mejores
 * para que dos personas no vean exactamente el mismo test.
 */
export function selectNextItem(
  pool: IrtItem[],
  answered: { id: string; skill: SkillName }[],
  theta: number,
  random: () => number = Math.random,
): IrtItem | null {
  const used = new Set(answered.map((a) => a.id));
  const candidates = pool.filter((i) => !used.has(i.id));
  if (!candidates.length) return null;

  const answeredSkills = answered.map((a) => a.skill);
  const missing = missingSkills(answeredSkills);
  // Al acercarse al final, forzar las habilidades que faltan.
  const forcing = missing.length > 0 && answered.length >= TEST_RULES.minItems - 4;
  let restricted = forcing ? candidates.filter((c) => missing.includes(c.skill)) : candidates;
  if (!restricted.length) restricted = candidates;

  const lastSkill = answeredSkills.at(-1);
  const countBySkill = (s: SkillName) => answeredSkills.filter((x) => x === s).length;

  const scored = restricted
    .map((item) => {
      let score = information(theta, item.difficulty, item.optionCount);
      if (item.skill === lastSkill) score *= 0.75; // evita dos seguidas de lo mismo
      score *= 1 / (1 + 0.15 * countBySkill(item.skill));
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, Math.min(3, scored.length));
  return top[Math.floor(random() * top.length)].item;
}

/** Porcentaje de acierto por habilidad (0..1), para el informe. */
export function skillScores(rows: { skill: SkillName; correct: boolean }[]): Partial<Record<SkillName, number>> {
  const out: Partial<Record<SkillName, number>> = {};
  for (const skill of ["GRAMMAR", "VOCAB", "READING", "LISTENING"] as SkillName[]) {
    const r = rows.filter((x) => x.skill === skill);
    if (r.length) out[skill] = r.filter((x) => x.correct).length / r.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Barajar opciones de forma determinista por intento + pregunta
// ---------------------------------------------------------------------------

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Permutacion: posicion mostrada -> indice original. */
export function optionPermutation(attemptId: string, itemId: string, n: number): number[] {
  const rand = mulberry32(hashSeed(`${attemptId}:${itemId}`));
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm;
}
