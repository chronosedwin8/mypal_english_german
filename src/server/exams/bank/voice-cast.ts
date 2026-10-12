/**
 * Partes puras del audio del banco (sin base de datos ni red): reparto de voces,
 * division del guion en solicitudes y comparacion guion/transcripcion.
 */
import type { ExamLanguage } from "@/content/exams/types";
import { normalizeAnswer } from "@/server/exams/scoring/objective";
import { examVoices, examinerVoice } from "@/server/speech/voices";

import type { ListeningBlock } from "./schemas";

export interface CastVoice {
  id: string;
  name: string;
  gender: "F" | "M" | null;
  accent: string | null;
}

/** "Alice-UK-F" → acento UK, genero F; "Milly-F" → genero F. */
export function voicePool(language: ExamLanguage): CastVoice[] {
  return examVoices(language).map((v) => {
    const parts = v.name.split("-");
    const last = parts[parts.length - 1]?.toUpperCase();
    const gender = last === "F" || last === "M" ? last : null;
    const accent = parts.length >= 3 ? parts[parts.length - 2].toUpperCase() : null;
    return { id: v.id, name: parts[0], gender, accent };
  });
}

/** Asigna una voz distinta a cada hablante segun genero y acento; el narrador usa la del examinador. */
export function castVoices(block: Pick<ListeningBlock, "speakers">, language: ExamLanguage): Record<string, CastVoice> {
  const pool = voicePool(language);
  if (!pool.length) throw new Error("No hay voces de examen configuradas");
  const used = new Set<string>();
  const cast: Record<string, CastVoice> = {};
  let narratorId: string | null = null;
  try {
    narratorId = examinerVoice(language);
  } catch {
    narratorId = null;
  }
  const narrator = pool.find((v) => v.id === narratorId) ?? pool[0];
  cast.NARRATOR = narrator;
  used.add(narrator.id);

  for (const s of block.speakers) {
    const free = pool.filter((v) => !used.has(v.id));
    const pick =
      free.find((v) => v.gender === s.gender && (s.accent === "ANY" || v.accent === s.accent)) ??
      free.find((v) => v.gender === s.gender) ??
      free[0] ??
      pool.find((v) => v.gender === s.gender && v.id !== narrator.id) ??
      pool[0];
    cast[s.id] = pick;
    used.add(pick.id);
  }
  return cast;
}

/** Parte las lineas en solicitudes de hasta `maxChars` caracteres. */
export function chunkLines<T extends { text: string }>(lines: T[], maxChars: number): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let size = 0;
  const pieces: T[] = [];
  for (const l of lines) {
    if (l.text.length <= maxChars) {
      pieces.push(l);
      continue;
    }
    // una linea muy larga se parte por oraciones
    let buf = "";
    for (const sentence of l.text.match(/[^.!?]+[.!?]*\s*/g) ?? [l.text]) {
      if (buf && buf.length + sentence.length > maxChars) {
        pieces.push({ ...l, text: buf.trim() });
        buf = "";
      }
      buf += sentence;
    }
    if (buf.trim()) pieces.push({ ...l, text: buf.trim() });
  }
  for (const p of pieces) {
    if (current.length && size + p.text.length > maxChars) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(p);
    size += p.text.length;
  }
  if (current.length) out.push(current);
  return out;
}

/** Proporcion del guion que aparece, en orden, en la transcripcion (LCS por palabras). */
export function scriptMatch(script: string, transcript: string): number {
  const a = normalizeAnswer(script).split(" ").filter(Boolean);
  const b = normalizeAnswer(transcript).split(" ").filter(Boolean);
  if (!a.length) return 1;
  let prev = new Uint16Array(b.length + 1);
  let cur = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    [prev, cur] = [cur, prev];
    cur.fill(0);
  }
  return prev[b.length] / a.length;
}
