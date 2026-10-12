import { describe, expect, it } from "vitest";

import { buildPlan, overallOf, weekStartOf, type PlanInput } from "@/server/study/planner-core";

const base: PlanInput = {
  today: new Date("2026-10-12T10:00:00Z"), // lunes
  examDate: new Date("2026-12-07T09:00:00Z"),
  hoursPerWeek: 6,
  days: [1, 3, 5],
  target: 7,
  current: { LISTENING: 6, READING: 7, WRITING: 5.5, SPEAKING: 6 },
  taskMastery: [
    { section: "READING", taskType: "TRUE_FALSE_NOT_GIVEN", value: 0.4, n: 20 },
    { section: "READING", taskType: "MATCHING_HEADINGS", value: 0.9, n: 20 },
  ],
  taskTypes: { LISTENING: ["FORM_COMPLETION", "MCQ_SINGLE"], READING: ["TRUE_FALSE_NOT_GIVEN", "MATCHING_HEADINGS", "SHORT_ANSWER"] },
  mocksAvailable: 2,
  hasTutorMinutes: false,
  hoursPerBand: 150,
  defaultWeeks: 8,
};

describe("planificador de estudio", () => {
  it("calcula semanas, reparte por brecha y respeta el cupo de simulacros", () => {
    const r = buildPlan(base);
    expect(r.weeks).toBe(9);
    const mocks = r.items.filter((i) => i.kind === "MOCK");
    expect(mocks).toHaveLength(2);
    // el ultimo simulacro va la semana anterior al examen
    expect(mocks.some((m) => m.weekStart.toISOString().slice(0, 10) === "2026-11-30")).toBe(true);
    const minutes = (s: string) => r.items.filter((i) => i.section === s).reduce((a, i) => a + i.minutes, 0);
    // Writing tiene la brecha mayor (1,5); Reading ya esta en la meta (0,25)
    expect(minutes("WRITING")).toBeGreaterThan(minutes("READING"));
    // todas las tareas caen en dias disponibles y antes del examen
    for (const i of r.items) {
      expect([1, 3, 5]).toContain(i.dueDate.getUTCDay());
      expect(i.dueDate.getTime()).toBeLessThan(base.examDate!.getTime());
    }
  });

  it("practica primero los tipos sin practicar y los mas debiles", () => {
    const r = buildPlan({ ...base, current: { ...base.current, READING: 5 } });
    const firstDrill = r.items.find((i) => i.kind === "DRILL" && i.section === "READING");
    expect(firstDrill?.taskType).toBe("SHORT_ANSWER"); // nunca practicado
    const readingDrills = r.items.filter((i) => i.kind === "DRILL" && i.section === "READING").map((i) => i.taskType);
    expect(readingDrills).toContain("TRUE_FALSE_NOT_GIVEN");
  });

  it("avisa cuando la fecha no alcanza para la meta", () => {
    const r = buildPlan({ ...base, hoursPerWeek: 2, target: 8 });
    expect(r.projectedOverall).not.toBeNull();
    expect(r.warning).toMatch(/Para llegar a 8\.0/);
    expect(buildPlan({ ...base, target: 6 }).warning).toBeNull();
  });

  it("sin fecha usa las semanas por defecto; la banda general usa el redondeo oficial", () => {
    expect(buildPlan({ ...base, examDate: null }).weeks).toBe(8);
    expect(overallOf({ LISTENING: 6.5, READING: 6.5, WRITING: 5, SPEAKING: 7 })).toBe(6.5); // 6,25 → 6,5
    expect(overallOf({ LISTENING: 6, READING: 6, WRITING: 6, SPEAKING: null })).toBeNull();
    expect(weekStartOf(new Date("2026-10-15T12:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-12");
  });
});
