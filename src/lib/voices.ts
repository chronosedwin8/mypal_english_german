/**
 * Rutas publicas de los audios del test de nivel (generados una vez).
 * Los IDs de las voces NO estan en el codigo: vienen de .env (ver src/server/speech/voices.ts).
 */
export type Variant = "EN_US" | "EN_GB" | "DE";

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
