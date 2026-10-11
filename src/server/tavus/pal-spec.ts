/**
 * Especificacion de los 3 PALs tutores derivados del PAL base (sin modificarlo).
 * La comparten el script de setup y la app.
 */
import { createHash } from "node:crypto";

import { PERCEPTION_ANALYSIS_QUERIES, VISUAL_AWARENESS_QUERIES, tutorSystemPrompt, type TutorVariant } from "./prompts";
import type { TavusPalRecord } from "./types";

export const TUTOR_VARIANTS: TutorVariant[] = ["EN_US", "EN_GB", "DE"];

const NAMES: Record<TutorVariant, string> = {
  EN_US: "MyPAL Tutor · English (US)",
  EN_GB: "MyPAL Tutor · English (UK)",
  DE: "MyPAL Tutor · Deutsch",
};

const LANGS: Record<TutorVariant, string[]> = {
  EN_US: ["en", "es"],
  EN_GB: ["en", "es"],
  DE: ["de", "es"],
};

function voiceFor(variant: TutorVariant): string | undefined {
  const v = { EN_US: process.env.TAVUS_VOICE_EN_US, EN_GB: process.env.TAVUS_VOICE_EN_GB, DE: process.env.TAVUS_VOICE_DE }[variant];
  return v?.trim() || undefined;
}

export function buildPalSpec(variant: TutorVariant, base: TavusPalRecord, faceId: string): Record<string, unknown> {
  const baseLayers = (base.layers ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const voice = voiceFor(variant);
  const engine = process.env.TAVUS_TTS_ENGINE?.trim();

  // Voz: si definiste una en .env se usa; si no, se hereda la del PAL base.
  const tts = voice
    ? { tts_engine: engine || "elevenlabs", external_voice_id: voice }
    : baseLayers.tts
      ? Object.fromEntries(
          Object.entries(baseLayers.tts).filter(([k, v]) => v !== "" && v !== null && k !== "api_key" && k !== "playht_user_id"),
        )
      : undefined;

  const spec: Record<string, unknown> = {
    pal_name: NAMES[variant],
    pipeline_mode: "full",
    system_prompt: tutorSystemPrompt(variant),
    default_face_id: faceId,
    languages: LANGS[variant],
    dynamic_greeting: false,
    disclosure_type: "auto",
    layers: {
      ...(tts ? { tts } : {}),
      perception: {
        perception_model: "raven-1",
        visual_awareness_queries: VISUAL_AWARENESS_QUERIES,
        perception_analysis_queries: PERCEPTION_ANALYSIS_QUERIES,
      },
      conversational_flow: {
        turn_detection_model: (baseLayers.conversational_flow?.turn_detection_model as string) ?? "sparrow-2",
        // Los estudiantes necesitan pensar antes de hablar.
        turn_taking_patience: "high",
        pal_interruptibility: "low",
        voice_isolation: "near",
      },
    },
  };
  if (base.guardrail_ids?.length) spec.guardrail_ids = base.guardrail_ids;
  return spec;
}

export function palName(variant: TutorVariant) {
  return NAMES[variant];
}

/** Hash estable de la especificacion (para saber si hay que actualizar el PAL). */
export function specHash(spec: Record<string, unknown>): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]))
        : v;
  return createHash("sha256").update(JSON.stringify(stable(spec))).digest("hex").slice(0, 16);
}
