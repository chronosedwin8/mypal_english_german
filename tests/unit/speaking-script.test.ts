import { describe, expect, it } from "vitest";

import { fluencyMetrics, nextScriptedTurn, part1Lines, part3Prepared } from "@/server/exams/speaking-script";

const p1 = { frames: [{ topic: "Work", questions: ["Do you work?", "Why?"] }, { topic: "Music", questions: ["Do you like music?"] }] };
const p2 = {
  card: { task: "Describe a place you like.", cuePoints: ["where"], finalLine: "and explain why." },
  roundingOff: ["Do you go there often?"],
  discussion: [{ theme: "Public spaces", questions: ["Why are parks important?", "Who should pay for them?"] }],
};

describe("guion del examinador", () => {
  it("Parte 1: saludo, preguntas y cambio de tema, con limite", () => {
    const lines = part1Lines(p1, "George", 9);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^Good morning\. My name is George.*Let's talk about work\. Do you work\?$/);
    expect(lines[2]).toBe("Now let's talk about music. Do you like music?");
    expect(part1Lines(p1, "George", 2)).toHaveLength(2);
  });

  it("Parte 2: tarjeta, cierre y fin", () => {
    const ctx = { p2, examinerName: "George", limits: { part1Questions: 9, part3Questions: 6 } };
    expect(nextScriptedTurn(2, [], ctx)?.expects).toBe("longturn");
    const cand = { kind: "candidate" as const, audioKey: "k", transcript: "x", durationMs: 1000, words: [] };
    expect(nextScriptedTurn(2, [cand], ctx)?.text).toBe("Thank you. Do you go there often?");
    expect(nextScriptedTurn(2, [cand, cand], ctx)).toBeNull();
  });

  it("Parte 3: introduce el tema de la tarjeta", () => {
    expect(part3Prepared(p2)[0]).toMatch(/^We've been talking about a place you like.*Let's consider public spaces\. Why are parks important\?$/);
  });

  it("mide fluidez con las marcas de tiempo", () => {
    const words = [
      { text: "I", start: 0, end: 0.2 },
      { text: "um", start: 0.3, end: 0.5 },
      { text: "think", start: 2.5, end: 2.8 },
      { text: "so", start: 2.9, end: 3 },
    ];
    const m = fluencyMetrics([{ kind: "candidate", audioKey: "k", transcript: "I um think so", durationMs: 3000, words }]);
    expect(m).toMatchObject({ answers: 1, words: 4, speakingSeconds: 3, wordsPerMinute: 80, longPausesPerMinute: 20, fillersPerMinute: 20 });
  });
});
