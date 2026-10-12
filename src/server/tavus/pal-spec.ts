/**
 * Especificacion de los PALs tutores derivados del PAL base (sin modificarlo).
 *  - Adultos: Poly (cara del PAL base), con voces femeninas por variante.
 *  - Niños: Nuez, la ardilla (TAVUS_KIDS_FACE_ID), con su voz propia.
 * La comparten el script de setup y la app.
 */
import { createHash } from "node:crypto";

import {
  PERCEPTION_ANALYSIS_QUERIES,
  VISUAL_AWARENESS_QUERIES,
  kidsSystemPrompt,
  tutorSystemPrompt,
  type TutorVariant,
} from "./prompts";
import type { TavusPalRecord } from "./types";

export type TutorAudience = "ADULT" | "KIDS";

export const TUTOR_VARIANTS: TutorVariant[] = ["EN_US", "EN_GB", "DE"];
export const TUTOR_AUDIENCES: TutorAudience[] = ["ADULT", "KIDS"];

const NAMES: Record<TutorAudience, Record<TutorVariant, string>> = {
  ADULT: { EN_US: "MyPAL Tutor · English (US)", EN_GB: "MyPAL Tutor · English (UK)", DE: "MyPAL Tutor · Deutsch" },
  KIDS: { EN_US: "MyPAL Kids · English (US)", EN_GB: "MyPAL Kids · English (UK)", DE: "MyPAL Kids · Deutsch" },
};

const LANGS: Record<TutorVariant, string[]> = {
  EN_US: ["en", "es"],
  EN_GB: ["en", "es"],
  DE: ["de", "es"],
};

const KIDS_VISUAL_QUERIES = [
  "Which toys, animals, fruits or everyday objects is the child holding up or showing?",
  "What colours are the objects the child is showing?",
  "Does the child look happy, bored or confused?",
];

function voiceFor(variant: TutorVariant): string | undefined {
  const v = { EN_US: process.env.TAVUS_VOICE_EN_US, EN_GB: process.env.TAVUS_VOICE_EN_GB, DE: process.env.TAVUS_VOICE_DE }[variant];
  return v?.trim() || undefined;
}

export function kidsFaceId(): string | null {
  return process.env.TAVUS_KIDS_FACE_ID?.trim() || null;
}

export function buildPalSpec(
  variant: TutorVariant,
  audience: TutorAudience,
  base: TavusPalRecord,
  faceId: string,
): Record<string, unknown> {
  const baseLayers = (base.layers ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const kids = audience === "KIDS";
  const voice = kids ? undefined : voiceFor(variant);
  const engine = process.env.TAVUS_TTS_ENGINE?.trim();

  // Adultos: voz definida en .env o la del PAL base. Niños: la voz propia de la cara.
  const tts = voice
    ? { tts_engine: engine || "elevenlabs", external_voice_id: voice }
    : !kids && baseLayers.tts
      ? Object.fromEntries(
          Object.entries(baseLayers.tts).filter(([k, v]) => v !== "" && v !== null && k !== "api_key" && k !== "playht_user_id"),
        )
      : undefined;

  const spec: Record<string, unknown> = {
    pal_name: NAMES[audience][variant],
    pipeline_mode: "full",
    system_prompt: kids ? kidsSystemPrompt(variant) : tutorSystemPrompt(variant),
    default_face_id: faceId,
    languages: LANGS[variant],
    dynamic_greeting: false,
    disclosure_type: "auto",
    layers: {
      ...(tts ? { tts } : {}),
      perception: {
        perception_model: "raven-1",
        visual_awareness_queries: kids ? KIDS_VISUAL_QUERIES : VISUAL_AWARENESS_QUERIES,
        perception_analysis_queries: PERCEPTION_ANALYSIS_QUERIES,
      },
      conversational_flow: {
        turn_detection_model: (baseLayers.conversational_flow?.turn_detection_model as string) ?? "sparrow-2",
        // Los estudiantes (y mas los niños) necesitan pensar antes de hablar.
        turn_taking_patience: "high",
        pal_interruptibility: "low",
        voice_isolation: "near",
      },
    },
  };
  if (base.guardrail_ids?.length) spec.guardrail_ids = base.guardrail_ids;
  return spec;
}

export function palName(variant: TutorVariant, audience: TutorAudience = "ADULT") {
  return NAMES[audience][variant];
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
