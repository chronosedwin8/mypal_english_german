/**
 * Voces de ElevenLabs leidas de .env (formato "id:nombre,id:nombre").
 * Ningun ID de voz esta escrito en el codigo.
 */
import type { Variant } from "@/lib/voices";

export interface VoiceRef {
  id: string;
  name: string;
}

export function parseVoices(raw: string | undefined): VoiceRef[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [id, ...name] = s.split(":");
      return { id: id.trim(), name: name.join(":").trim() || id.trim() };
    });
}

function required(name: string): VoiceRef[] {
  const list = parseVoices(process.env[name]);
  if (!list.length) throw new Error(`Falta ${name} en .env (voces de ElevenLabs)`);
  return list;
}

/** Voces del test de nivel por variante. */
export function diagnosticVoices(variant: Variant): VoiceRef[] {
  return required(`ELEVENLABS_VOICES_${variant}`);
}

/** Voces para los audios de examen (varios acentos en ingles; nativas en aleman). */
export function examVoices(language: "en" | "de"): VoiceRef[] {
  return required(language === "en" ? "ELEVENLABS_EXAM_VOICES_EN" : "ELEVENLABS_EXAM_VOICES_DE");
}

export function examinerVoice(language: "en" | "de"): string {
  const id = process.env[language === "en" ? "ELEVENLABS_EXAMINER_EN" : "ELEVENLABS_EXAMINER_DE"]?.trim();
  if (!id) throw new Error(`Falta ELEVENLABS_EXAMINER_${language.toUpperCase()} en .env`);
  return id;
}
