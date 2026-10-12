import { describe, expect, it } from "vitest";

import { EXAMS, totalItems } from "@/content/exams";
import {
  IELTS_LISTENING_TABLE,
  IELTS_READING_ACADEMIC_TABLE,
  goetheGrade,
  goethePoints,
  ieltsOverall,
  ieltsRoundOverall,
  ieltsWritingBand,
  rawToBand,
  testdafScale,
  testdafTdn,
} from "@/content/exams/scales";

describe("IELTS", () => {
  it.each([
    [6.25, 6.5],
    [6.125, 6.0],
    [3.875, 4.0],
    [6.75, 7.0],
    [6.5, 6.5],
    [7.0, 7.0],
    [5.625, 5.5],
  ])("redondeo de la banda general %f -> %f", (avg, band) => {
    expect(ieltsRoundOverall(avg)).toBe(band);
  });

  it("banda general con las 4 secciones", () => {
    expect(ieltsOverall({ listening: 6.5, reading: 6.5, writing: 5.5, speaking: 6.5 })).toBe(6.5);
    expect(ieltsOverall({ listening: 4, reading: 3.5, writing: 4, speaking: 4 })).toBe(4);
  });

  it("referencias publicas aproximadas de Listening y Reading", () => {
    expect(rawToBand(16, IELTS_LISTENING_TABLE)).toBe(5);
    expect(rawToBand(15, IELTS_READING_ACADEMIC_TABLE)).toBe(5);
    expect(rawToBand(23, IELTS_LISTENING_TABLE)).toBe(6);
    expect(rawToBand(23, IELTS_READING_ACADEMIC_TABLE)).toBe(6);
    expect(rawToBand(30, IELTS_LISTENING_TABLE)).toBe(7);
    expect(rawToBand(35, IELTS_READING_ACADEMIC_TABLE)).toBe(8);
    expect(rawToBand(40, IELTS_LISTENING_TABLE)).toBe(9);
  });

  it("las tablas son siempre crecientes", () => {
    for (const table of [IELTS_LISTENING_TABLE, IELTS_READING_ACADEMIC_TABLE]) {
      let last = -1;
      for (let c = 0; c <= 40; c++) {
        const b = rawToBand(c, table);
        expect(b).toBeGreaterThanOrEqual(last);
        last = b;
      }
    }
  });

  it("Writing: la Tarea 2 pesa el doble", () => {
    expect(ieltsWritingBand(6, 7)).toBe(6.5);
    expect(ieltsWritingBand(5, 7)).toBe(6.5);
    expect(ieltsWritingBand(7, 5)).toBe(5.5);
  });
});

describe("Goethe", () => {
  it("conversion a 100 puntos", () => {
    expect(goethePoints(25)).toBe(83);
    expect(goethePoints(30)).toBe(100);
    expect(goethePoints(18)).toBe(60);
    expect(goethePoints(0)).toBe(0);
  });
  it("calificaciones", () => {
    expect(goetheGrade(95)).toBe("sehr gut");
    expect(goetheGrade(80)).toBe("gut");
    expect(goetheGrade(70)).toBe("befriedigend");
    expect(goetheGrade(60)).toBe("ausreichend");
    expect(goetheGrade(59)).toBe("nicht bestanden");
  });
});

describe("TestDaF", () => {
  it("escala 0–20 y TDN estimado", () => {
    expect(testdafScale(34, 34)).toBe(20);
    expect(testdafScale(17, 34)).toBe(10);
    const cut = { tdn5: 16, tdn4: 12, tdn3: 8 };
    expect(testdafTdn(17, cut)).toBe("TDN 5");
    expect(testdafTdn(12, cut)).toBe("TDN 4");
    expect(testdafTdn(7.9, cut)).toBe("unter TDN 3");
  });
});

describe("especificaciones de examen", () => {
  it("IELTS: 40 preguntas en Listening y Reading; Writing ≥150 y ≥250 palabras", () => {
    const ielts = EXAMS.IELTS_ACADEMIC;
    expect(totalItems(ielts.sections.find((s) => s.section === "LISTENING")!)).toBe(40);
    expect(totalItems(ielts.sections.find((s) => s.section === "READING")!)).toBe(40);
    const w = ielts.sections.find((s) => s.section === "WRITING")!;
    expect(w.parts.map((p) => p.minWords)).toEqual([150, 250]);
    expect(ielts.sections.find((s) => s.section === "LISTENING")!.parts.every((p) => p.plays === 1)).toBe(true);
  });

  it.each(["GOETHE_B1", "GOETHE_B2", "GOETHE_C1"] as const)("%s: Lesen y Hören con 30 items", (code) => {
    const spec = EXAMS[code];
    expect(totalItems(spec.sections.find((s) => s.section === "READING")!)).toBe(30);
    expect(totalItems(spec.sections.find((s) => s.section === "LISTENING")!)).toBe(30);
  });

  it("Goethe B2: reproducciones de Hören 1, 2, 1, 2", () => {
    const h = EXAMS.GOETHE_B2.sections.find((s) => s.section === "LISTENING")!;
    expect(h.parts.map((p) => p.plays)).toEqual([1, 2, 1, 2]);
  });

  it("TestDaF: 7 tareas por seccion de Lesen, Hören y Sprechen", () => {
    for (const sec of ["READING", "LISTENING", "SPEAKING"] as const) {
      expect(EXAMS.TESTDAF.sections.find((s) => s.section === sec)!.parts).toHaveLength(7);
    }
  });
});
