import { describe, expect, it } from "vitest";

import { DE_ITEMS } from "@/content/diagnostic/de";
import { EN_ITEMS } from "@/content/diagnostic/en";
import { LEVEL_DIFFICULTY } from "@/content/diagnostic/types";
import {
  LEVEL_ORDER,
  estimateAbility,
  levelFromTheta,
  missingSkills,
  optionPermutation,
  probability,
  selectNextItem,
  shouldStop,
  type IrtItem,
} from "@/server/diagnostic/irt";
import { scoreOpenAnswer, scoreReadAloud, speakingLevel } from "@/server/diagnostic/speaking-score";

function poolFrom(items: typeof EN_ITEMS): IrtItem[] {
  return items.map((it, i) => ({
    id: it.id,
    skill: it.skill,
    difficulty: LEVEL_DIFFICULTY[it.level] + ((i % 5) - 2) * 0.12,
    optionCount: it.options.length,
  }));
}

/** Pseudoaleatorio reproducible. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/** Simula a un estudiante de habilidad θ real haciendo el test completo. */
function simulate(pool: IrtItem[], trueTheta: number, seed: number) {
  const random = rng(seed);
  const answered: { id: string; skill: IrtItem["skill"]; difficulty: number; optionCount: number; correct: boolean }[] = [];
  let est = estimateAbility([]);
  for (;;) {
    const next = selectNextItem(pool, answered, est.theta, random);
    if (!next) break;
    const correct = random() < probability(trueTheta, next.difficulty, next.optionCount);
    answered.push({ ...next, correct });
    est = estimateAbility(answered);
    if (shouldStop(answered.length, est.se, missingSkills(answered.map((a) => a.skill)).length)) break;
  }
  return { ...est, answered };
}

describe("banco de preguntas", () => {
  it.each([
    ["EN", EN_ITEMS],
    ["DE", DE_ITEMS],
  ] as const)("%s: ids unicos, 10 por nivel, 2 de escucha por nivel", (_l, items) => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const level of LEVEL_ORDER) {
      const lv = items.filter((i) => i.level === level);
      expect(lv).toHaveLength(10);
      expect(lv.filter((i) => i.skill === "LISTENING")).toHaveLength(2);
      for (const i of lv.filter((x) => x.skill === "LISTENING")) expect(i.audioText).toBeTruthy();
    }
    for (const i of items) {
      expect(i.options.length).toBeGreaterThanOrEqual(3);
      expect(new Set(i.options).size).toBe(i.options.length);
    }
  });
});

describe("motor IRT", () => {
  it("la estimacion sube con respuestas correctas y baja con incorrectas", () => {
    const base = estimateAbility([]);
    const up = estimateAbility([{ difficulty: 0, optionCount: 4, correct: true }]);
    const down = estimateAbility([{ difficulty: 0, optionCount: 4, correct: false }]);
    expect(up.theta).toBeGreaterThan(base.theta);
    expect(down.theta).toBeLessThan(base.theta);
    expect(up.se).toBeLessThan(base.se);
  });

  it("cortes de nivel", () => {
    expect(levelFromTheta(-3)).toBe("A1");
    expect(levelFromTheta(-1)).toBe("A2");
    expect(levelFromTheta(0)).toBe("B1");
    expect(levelFromTheta(1)).toBe("B2");
    expect(levelFromTheta(2.5)).toBe("C1");
  });

  it("el test termina entre 12 y 20 preguntas y cubre escucha y lectura", () => {
    const pool = poolFrom(EN_ITEMS);
    for (let s = 1; s <= 20; s++) {
      const r = simulate(pool, -1 + (s % 5) * 0.6, s);
      expect(r.answered.length).toBeGreaterThanOrEqual(12);
      expect(r.answered.length).toBeLessThanOrEqual(20);
      expect(r.answered.filter((a) => a.skill === "LISTENING").length).toBeGreaterThanOrEqual(2);
      expect(r.answered.filter((a) => a.skill === "READING").length).toBeGreaterThanOrEqual(1);
      expect(new Set(r.answered.map((a) => a.id)).size).toBe(r.answered.length);
    }
  });

  it("ubica a estudiantes simulados cerca de su nivel real (±1 nivel en >= 85 %)", () => {
    const pool = poolFrom(DE_ITEMS);
    let ok = 0;
    let total = 0;
    for (const level of LEVEL_ORDER) {
      for (let s = 0; s < 40; s++) {
        const trueTheta = LEVEL_DIFFICULTY[level];
        const r = simulate(pool, trueTheta, 1000 + s * 7 + level.charCodeAt(1));
        const diff = Math.abs(LEVEL_ORDER.indexOf(levelFromTheta(r.theta)) - LEVEL_ORDER.indexOf(level));
        if (diff <= 1) ok++;
        total++;
      }
    }
    expect(ok / total).toBeGreaterThanOrEqual(0.85);
  });

  it("barajar opciones es una permutacion determinista", () => {
    const a = optionPermutation("intento-1", "en-a1-01", 4);
    expect([...a].sort()).toEqual([0, 1, 2, 3]);
    expect(optionPermutation("intento-1", "en-a1-01", 4)).toEqual(a);
    const positions = new Set<number>();
    for (let i = 0; i < 40; i++) positions.add(optionPermutation(`x${i}`, "en-a1-01", 4).indexOf(0));
    expect(positions.size).toBe(4); // la respuesta correcta no queda siempre en el mismo lugar
  });
});

describe("puntuacion de habla", () => {
  it("lectura perfecta = 1, con errores baja, idioma equivocado = mitad", () => {
    const reference = "I like to drink coffee in the morning with my family.";
    expect(scoreReadAloud({ reference, transcript: "I like to drink coffee in the morning with my family", languageMatches: true }).score).toBe(1);
    const partial = scoreReadAloud({ reference, transcript: "I like drink coffee in morning", languageMatches: true });
    expect(partial.score).toBeGreaterThan(0.3);
    expect(partial.score).toBeLessThan(0.8);
    expect(scoreReadAloud({ reference, transcript: reference, languageMatches: false }).score).toBe(0.5);
    expect(scoreReadAloud({ reference, transcript: "", languageMatches: true }).score).toBe(0);
  });

  it("respuesta abierta: mas palabras variadas = mejor", () => {
    const short = scoreOpenAnswer({ transcript: "My place is park. Park is nice.", durationMs: 20000, languageMatches: true });
    const rich = scoreOpenAnswer({
      transcript:
        "My favourite place is a small café near the river where I usually read books on Sundays because it is quiet, cosy and the coffee is excellent.",
      durationMs: 20000,
      languageMatches: true,
    });
    expect(rich.score).toBeGreaterThan(short.score);
    expect(speakingLevel(0.1)).toBe("A1");
    expect(speakingLevel(0.9)).toBe("C1");
  });
});
