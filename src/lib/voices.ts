/**
 * Voces de ElevenLabs para los audios del test de nivel (generados una sola vez).
 * Dos voces por variante para que la escucha no sea monotona.
 */
export type Variant = "EN_US" | "EN_GB" | "DE";

export const DIAGNOSTIC_VOICES: Record<Variant, { id: string; name: string }[]> = {
  EN_US: [
    { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (americana)" },
    { id: "cjVigY5qzO86Huf0OWal", name: "Eric (americano)" },
  ],
  EN_GB: [
    { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice (británica)" },
    { id: "JBFqnCBsd6RMkjVDRZzb", name: "George (británico)" },
  ],
  DE: [
    { id: "VD1if7jDVYtAKs4P0FIY", name: "Milly (alemana)" },
    { id: "K5ZVtkkBnuPY6YqXs70E", name: "Simon (alemán)" },
  ],
};

export const VARIANTS_FOR_BASE: Record<"EN" | "DE", Variant[]> = {
  EN: ["EN_US", "EN_GB"],
  DE: ["DE"],
};

export function diagnosticAudioPath(variant: Variant, itemId: string) {
  return `/audio/diagnostic/${variant}/${itemId}.mp3`;
}

export function speakingAudioPath(variant: Variant, taskId: string) {
  return `/audio/speaking/${variant}/${taskId}.mp3`;
}
