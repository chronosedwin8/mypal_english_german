import { describe, expect, it } from "vitest";

import { IELTS_LISTENING_TABLE } from "@/content/exams/scales";
import { equateTable, isDefective, pointBiserial, rasch, type Observation } from "@/server/exams/calibration-core";

/** Generador determinista (mulberry32) para simular respuestas. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(trueB: number[], people: number, seed = 7, reversed: number[] = []): Observation[] {
  const r = rng(seed);
  const obs: Observation[] = [];
  for (let p = 0; p < people; p++) {
    // habilidad ~ N(0, 1) por Box-Muller
    const theta = Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
    trueB.forEach((b, i) => {
      let correct = r() < 1 / (1 + Math.exp(-(theta - b)));
      if (reversed.includes(i)) correct = r() < 1 / (1 + Math.exp(theta - b)); // los mejores fallan mas
      obs.push({ person: `p${p}`, item: `i${i}`, correct });
    });
  }
  return obs;
}

describe("calibracion Rasch", () => {
  it("recupera las dificultades simuladas", () => {
    // 20 preguntas de −1,9 a 1,9 (media 0), 600 personas
    const trueB = Array.from({ length: 20 }, (_, i) => -1.9 + i * 0.2);
    const { difficulty } = rasch(simulate(trueB, 600));
    const est = trueB.map((_, i) => difficulty.get(`i${i}`)!);
    est.forEach((b, i) => expect(Math.abs(b - trueB[i])).toBeLessThan(0.3));
    expect(est[19] - est[0]).toBeGreaterThan(3.2);
  });

  it("no diverge con personas que aciertan todo o nada", () => {
    const obs: Observation[] = [
      ...["a", "b"].map((item) => ({ person: "todo", item, correct: true })),
      ...["a", "b"].map((item) => ({ person: "nada", item, correct: false })),
      { person: "mitad", item: "a", correct: true },
      { person: "mitad", item: "b", correct: false },
    ];
    const { difficulty, ability } = rasch(obs);
    for (const v of [...difficulty.values(), ...ability.values()]) expect(Number.isFinite(v)).toBe(true);
  });

  it("la punto-biserial delata una clave invertida", () => {
    const trueB = Array.from({ length: 30 }, (_, i) => -1.5 + i * 0.1);
    const disc = pointBiserial(simulate(trueB, 400, 11, [5]));
    expect(disc.get("i10")!).toBeGreaterThan(0.25);
    expect(disc.get("i5")!).toBeLessThan(0);
  });

  it("marca como defectuosa solo con suficientes respuestas", () => {
    const opts = { minResponses: 30, minDiscrimination: 0.1, minPCorrect: 0.1 };
    expect(isDefective({ n: 10, pCorrect: 0.02, discrimination: -0.4 }, opts)).toBe(false);
    expect(isDefective({ n: 40, pCorrect: 0.05, discrimination: 0.3 }, opts)).toBe(true);
    expect(isDefective({ n: 40, pCorrect: 0.6, discrimination: 0.02 }, opts)).toBe(true);
    expect(isDefective({ n: 40, pCorrect: 0.6, discrimination: 0.35 }, opts)).toBe(false);
  });
});

describe("equiparacion de formas", () => {
  it("una forma de dificultad media conserva la tabla base", () => {
    expect(equateTable(IELTS_LISTENING_TABLE, Array(40).fill(0))).toEqual(IELTS_LISTENING_TABLE);
  });

  it("una forma más difícil pide menos aciertos y una más fácil, más", () => {
    const hard = equateTable(IELTS_LISTENING_TABLE, Array(40).fill(0.5));
    const easy = equateTable(IELTS_LISTENING_TABLE, Array(40).fill(-0.5));
    const cut = (t: [number, number][], band: number) => t.find(([, b]) => b === band)![0];
    expect(cut(hard, 7)).toBeLessThan(30);
    expect(cut(easy, 7)).toBeGreaterThan(30);
    // monotona y dentro de rango
    for (const t of [hard, easy]) {
      for (let i = 1; i < t.length; i++) expect(t[i][0]).toBeLessThanOrEqual(t[i - 1][0]);
      expect(t.every(([c]) => c >= 1 && c <= 40)).toBe(true);
    }
  });
});
