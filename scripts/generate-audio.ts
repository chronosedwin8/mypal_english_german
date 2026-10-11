/**
 * Genera UNA SOLA VEZ los audios del test de nivel con ElevenLabs y los guarda
 * como MP3 estaticos en public/audio/. Despues no hay costo por usuario.
 *
 *   pnpm audio:generate            # genera los que falten
 *   pnpm audio:generate --dry-run  # muestra que generaria y cuantos caracteres
 *   pnpm audio:generate --force    # regenera todo
 */
import "dotenv/config";

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { DE_ITEMS } from "@/content/diagnostic/de";
import { EN_ITEMS } from "@/content/diagnostic/en";
import { SPEAKING_TASKS } from "@/content/diagnostic/speaking";
import type { CefrLevel } from "@/content/diagnostic/types";
import {
  DIAGNOSTIC_VOICES,
  VARIANTS_FOR_BASE,
  diagnosticAudioPath,
  speakingAudioPath,
  type Variant,
} from "@/lib/voices";
import { textToSpeech } from "@/server/speech/elevenlabs";

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

interface Job {
  file: string;
  text: string;
  voiceId: string;
  speed: number;
  label: string;
}

const SLOW_LEVELS: CefrLevel[] = ["A1", "A2"];

function jobs(): Job[] {
  const out: Job[] = [];
  const banks: ["EN" | "DE", typeof EN_ITEMS][] = [
    ["EN", EN_ITEMS],
    ["DE", DE_ITEMS],
  ];
  for (const [base, items] of banks) {
    const listening = items.filter((i) => i.skill === "LISTENING" && i.audioText);
    for (const variant of VARIANTS_FOR_BASE[base]) {
      listening.forEach((item, idx) => {
        const voices = DIAGNOSTIC_VOICES[variant];
        out.push({
          file: diagnosticAudioPath(variant, item.id),
          text: item.audioText!,
          voiceId: voices[idx % voices.length].id,
          speed: SLOW_LEVELS.includes(item.level) ? 0.9 : 1,
          label: `${variant} ${item.id}`,
        });
      });
    }
  }
  // Modelo de pronunciacion para las frases de lectura en voz alta.
  for (const task of SPEAKING_TASKS.filter((t) => t.kind === "READ_ALOUD")) {
    for (const variant of VARIANTS_FOR_BASE[task.lang] as Variant[]) {
      out.push({
        file: speakingAudioPath(variant, task.id),
        text: task.text,
        voiceId: DIAGNOSTIC_VOICES[variant][0].id,
        speed: task.band === "low" ? 0.9 : 1,
        label: `${variant} ${task.id}`,
      });
    }
  }
  return out;
}

async function main() {
  const all = jobs();
  const pending = all.filter((j) => force || !existsSync(path.join("public", j.file)));
  const chars = pending.reduce((s, j) => s + j.text.length, 0);
  console.log(`Audios: ${all.length} en total, ${pending.length} por generar (${chars} caracteres).`);
  if (dryRun) {
    for (const j of pending) console.log(`  · ${j.label}: "${j.text}"`);
    return;
  }
  let done = 0;
  for (const j of pending) {
    const audio = await textToSpeech({
      text: j.text,
      voiceId: j.voiceId,
      settings: { stability: 0.55, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true, speed: j.speed },
    });
    const target = path.join("public", j.file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, audio);
    done++;
    console.log(`  ✔ (${done}/${pending.length}) ${j.label} — ${(audio.length / 1024).toFixed(0)} KB`);
  }
  console.log("Listo.");
}

main().catch((err) => {
  console.error("✖", err instanceof Error ? err.message : err);
  process.exit(1);
});
