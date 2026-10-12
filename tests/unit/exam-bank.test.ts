import { describe, expect, it } from "vitest";

import { partSpec, sectionSpec } from "@/content/exams";
import { esc, niceScale, renderChartSvg, renderMapSvg } from "@/lib/render/svg";
import { castVoices, chunkLines, scriptMatch } from "@/server/exams/bank/voice-cast";
import { splitBlock } from "@/server/exams/bank/schemas";
import { validateBlock, validateChart } from "@/server/exams/bank/validators";
import { countWords, isObjectiveCorrect, isOptionalWordsVariant, normalizeAnswer, textContains } from "@/server/exams/scoring/objective";
import { concatMp3, mp3DurationMs, mp3Frames, silenceMp3 } from "@/server/speech/mp3";

import { listeningFixture, readingFixture } from "../fixtures/bank";

const READING_1 = { section: sectionSpec("IELTS_ACADEMIC", "READING"), part: partSpec("IELTS_ACADEMIC", "READING", 1) };
const LISTENING_4 = { section: sectionSpec("IELTS_ACADEMIC", "LISTENING"), part: partSpec("IELTS_ACADEMIC", "LISTENING", 4) };

describe("respuestas objetivas", () => {
  it("normaliza ortografia britanica/americana, numeros y articulos", () => {
    expect(normalizeAnswer("Colour")).toBe(normalizeAnswer("color"));
    expect(normalizeAnswer("the Centre")).toBe(normalizeAnswer("center"));
    expect(normalizeAnswer("organised")).toBe(normalizeAnswer("organized"));
    expect(normalizeAnswer("travelled")).toBe(normalizeAnswer("traveled"));
    expect(normalizeAnswer("twenty-five")).toBe("25");
    expect(normalizeAnswer("1,000")).toBe("1000");
    expect(normalizeAnswer("0161 496 0732")).toBe("01614960732");
    expect(normalizeAnswer("grey")).toBe("gray");
    expect(normalizeAnswer("twenty five")).toBe("25");
  });

  it("no une numeros de lineas u oraciones distintas", () => {
    const transcript = "Yes, my mobile is 0795311824.\n0795311824. Great. When were you looking to book?";
    expect(textContains(transcript, "0795311824")).toBe(true);
    expect(textContains("Call 0161 496 0732 today", "01614960732")).toBe(true);
  });

  it("califica con limite de palabras", () => {
    expect(isObjectiveCorrect("solar panels", ["solar panels"], 2)).toBe(true);
    expect(isObjectiveCorrect("the solar panels", ["solar panels"], 2)).toBe(false); // 3 palabras
    expect(isObjectiveCorrect("Solar Panels.", ["solar panels"], 2)).toBe(true);
    expect(isObjectiveCorrect("", ["x"], 1)).toBe(false);
    expect(isObjectiveCorrect("well-known", ["well-known"], 1)).toBe(true);
  });

  it("cuenta palabras como IELTS", () => {
    expect(countWords("well-known museum")).toBe(2);
    expect(countWords("0161 496 0732")).toBe(1);
    expect(countWords("15 pounds")).toBe(2);
  });

  it("busca frases con limites de palabra", () => {
    expect(textContains("The river carries sediment.", "carries sediment")).toBe(true);
    expect(textContains("The river carries sediments.", "sediment")).toBe(false);
  });

  it("acepta variantes con palabras opcionales que estan en el texto", () => {
    const source = "They used X-ray fluorescence spectrometry to test the obsidian.";
    expect(isOptionalWordsVariant("X-ray fluorescence spectrometry", "X-ray fluorescence", source, 3)).toBe(true);
    expect(isOptionalWordsVariant("X-ray fluorescence spectrometry", "X-ray fluorescence", source, 2)).toBe(false);
    expect(isOptionalWordsVariant("obsidian", "X-ray fluorescence", source, 3)).toBe(false);
  });
});

describe("validadores del banco", () => {
  it("un bloque de Reading valido no tiene problemas", () => {
    expect(validateBlock({ kind: "reading", data: readingFixture() }, READING_1.section, READING_1.part)).toEqual([]);
  });

  it("detecta respuesta fuera del texto, numeracion y limite", () => {
    const d = readingFixture();
    d.groups[1].questions[0].answers = ["mud"];
    d.groups[1].questions[1].answers = ["local granite stone"];
    d.groups[1].questions.pop();
    const issues = validateBlock({ kind: "reading", data: d }, READING_1.section, READING_1.part).join("\n");
    expect(issues).toMatch(/Q7: the answer "mud" must appear/);
    expect(issues).toMatch(/Q8: answer "local granite stone" exceeds the 2-word limit/);
    expect(issues).toMatch(/exactly 13 questions/);
  });

  it("exige respuestas variadas en True/False/Not Given", () => {
    const d = readingFixture();
    for (const q of d.groups[0].questions) q.answers = ["TRUE"];
    expect(validateBlock({ kind: "reading", data: d }, READING_1.section, READING_1.part).join()).toMatch(/must not all be the same/);
  });

  it("un bloque de Listening valido no tiene problemas", () => {
    expect(validateBlock({ kind: "listening", data: listeningFixture() }, LISTENING_4.section, LISTENING_4.part)).toEqual([]);
  });

  it("las respuestas de Listening deben oirse en orden", () => {
    const d = listeningFixture();
    const qs = d.groups[0].questions;
    [qs[2].evidence, qs[3].evidence] = [qs[3].evidence, qs[2].evidence];
    [qs[2].answers, qs[3].answers] = [qs[3].answers, qs[2].answers];
    expect(validateBlock({ kind: "listening", data: d }, LISTENING_4.section, LISTENING_4.part).join()).toMatch(/heard in question order/);
  });

  it("valida los datos de los graficos", () => {
    expect(validateChart({ kind: "pie", unit: "%", categories: ["a", "b"], series: [{ name: "x", values: [60, 30] }] }).join()).toMatch(/100%/);
    expect(validateChart({ kind: "bar", unit: "t", categories: ["a", "b"], series: [{ name: "x", values: [1] }] }).join()).toMatch(/needs 2 values/);
  });
});

describe("contenido publico y clave", () => {
  it("la clave y el guion nunca quedan en el contenido publico", () => {
    for (const block of [
      { kind: "reading" as const, data: readingFixture() },
      { kind: "listening" as const, data: listeningFixture() },
    ]) {
      const { content, answerKey } = splitBlock(block);
      const pub = JSON.stringify(content);
      expect(pub).not.toMatch(/"answers"|"evidence"|explanationEs|"lines"/);
      expect(JSON.stringify(answerKey)).toMatch(/"answers"/);
    }
    expect(JSON.stringify(splitBlock({ kind: "listening", data: listeningFixture() }).content)).not.toMatch(/relied on copper/);
  });
});

describe("audio", () => {
  it("mide y une MP3 quitando los cuadros Xing", () => {
    const a = silenceMp3(1000);
    expect(Math.abs(mp3DurationMs(a) - 1000)).toBeLessThan(30);
    // cuadro Xing falso al inicio de cada tramo
    const xing = Buffer.from(a.subarray(0, 417));
    xing.write("Xing", 4 + 17, "latin1");
    const part = Buffer.concat([xing, a]);
    expect(mp3Frames(part)[0].isInfo).toBe(true);
    const joined = concatMp3([part, part]);
    expect(mp3Frames(joined).some((f) => f.isInfo)).toBe(false);
    expect(Math.abs(mp3DurationMs(joined) - 2000)).toBeLessThan(60);
  });

  it("parte el guion en solicitudes cortas", () => {
    const lines = Array.from({ length: 30 }, (_, i) => ({ speaker: "S1", text: `Sentence number ${i} is here. `.repeat(5) }));
    const chunks = chunkLines(lines, 500);
    expect(chunks.every((c) => c.reduce((n, l) => n + l.text.length, 0) <= 500)).toBe(true);
    expect(chunks.flat().map((l) => l.text).join("")).toBe(lines.map((l) => l.text).join(""));
    const long = chunkLines([{ speaker: "S1", text: "A short sentence. ".repeat(100) }], 300);
    expect(long.flat().every((l) => l.text.length <= 300)).toBe(true);
  });

  it("compara el guion con la transcripcion", () => {
    expect(scriptMatch("Good morning, how can I help you?", "good morning how can i help you")).toBe(1);
    expect(scriptMatch("alpha beta gamma delta", "alpha gamma delta")).toBe(0.75);
  });

  it("reparte voces distintas por genero y acento", () => {
    process.env.ELEVENLABS_EXAM_VOICES_EN = "v1:Alice-UK-F,v2:George-UK-M,v3:Sarah-US-F,v4:Charlie-AU-M";
    process.env.ELEVENLABS_EXAMINER_EN = "v2";
    const cast = castVoices(
      {
        speakers: [
          { id: "S1", name: "A", role: "r", gender: "F", accent: "US" },
          { id: "S2", name: "B", role: "r", gender: "M", accent: "AU" },
          { id: "S3", name: "C", role: "r", gender: "F", accent: "ANY" },
        ],
      },
      "en",
    );
    expect(cast.NARRATOR.id).toBe("v2");
    expect(cast.S1.id).toBe("v3");
    expect(cast.S2.id).toBe("v4");
    expect(cast.S3.id).toBe("v1");
  });
});

describe("dibujo SVG", () => {
  it("escapa el texto y dibuja cada tipo de grafico", () => {
    expect(esc('<script>"x"</script>')).toBe("&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
    for (const kind of ["line", "bar", "pie", "table"] as const) {
      const svg = renderChartSvg({
        kind,
        title: "<b>Energy</b>",
        unit: "%",
        categories: ["Coal", "Gas", "Wind"],
        series: [{ name: "2000", values: [50, 30, 20] }],
      });
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).not.toContain("<b>");
      expect(svg).toContain("&lt;b&gt;Energy");
    }
    const map = renderMapSvg({
      title: "Park",
      places: [
        { key: "A", name: null, x: 1, y: 1, w: 2, h: 1 },
        { key: null, name: "Café", x: 5, y: 2, w: 2, h: 1 },
      ],
      paths: [{ x1: 0, y1: 4, x2: 12, y2: 4 }],
      entrance: { x: 6, y: 8, label: "Entrance" },
    });
    expect(map).toContain("Café");
    expect(map).toContain(">A<");
  });

  it("calcula escalas legibles", () => {
    expect(niceScale(0, 87)).toEqual({ lo: 0, hi: 100, step: 20 });
    expect(niceScale(-5, 12).lo).toBeLessThan(0);
  });
});
