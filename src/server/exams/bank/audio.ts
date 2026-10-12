/**
 * Audios de Listening del banco: reparto de voces (desde .env), sintesis por tramos
 * con ElevenLabs Text to Dialogue, subida a S3 y verificacion con Scribe (se compara
 * la transcripcion con el guion para detectar palabras perdidas o mal dichas).
 *
 * ELEVENLABS_DRIVER=fake genera silencio y no llama a ElevenLabs (tests, $0).
 */
import type { ExamCode, ExamLanguage } from "@/content/exams/types";
import { assertBudget, recordAiUsage, sttCostMicroUsd, ttsCostMicroUsd } from "@/server/ai/usage";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { speechToText, textToDialogue } from "@/server/speech/elevenlabs";
import { concatMp3, mp3DurationMs, silenceMp3 } from "@/server/speech/mp3";
import { storage, storageKeys } from "@/server/storage";

import type { ListeningBlock } from "./schemas";
import { castVoices, chunkLines, scriptMatch } from "./voice-cast";

/** Caracteres de voz gastados este mes (para el tope mensual). */
async function voiceCharsThisMonth(): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const agg = await db.aiUsage.aggregate({ where: { provider: "elevenlabs", createdAt: { gte: start } }, _sum: { characters: true } });
  return agg._sum.characters ?? 0;
}

export interface SynthesizedSegment {
  index: number;
  storageKey: string;
  durationMs: number;
  voices: Record<string, { id: string; name: string }>;
  script: { speaker: string; text: string }[];
  transcriptCheck: number;
  characters: number;
  costMicroUsd: bigint;
}

const fakeVoice = () => process.env.ELEVENLABS_DRIVER === "fake";

export async function synthesizeListening(input: {
  exam: ExamCode;
  language: ExamLanguage;
  itemSetId: string;
  block: ListeningBlock;
}): Promise<SynthesizedSegment[]> {
  const config = await getConfig();
  const maxChars = config["exam.audio.maxCharsPerRequest"];
  const totalChars = input.block.segments.flatMap((s) => s.lines).reduce((n, l) => n + l.text.length, 0);
  if (!fakeVoice()) {
    await assertBudget();
    const used = await voiceCharsThisMonth();
    if (used + totalChars > config["voice.monthlyCharBudget"])
      throw new Error(`Tope mensual de voz alcanzado (${used} de ${config["voice.monthlyCharBudget"]} caracteres). Ajústalo en el admin.`);
  }

  const cast = castVoices(input.block, input.language);
  const voices = Object.fromEntries(Object.entries(cast).map(([k, v]) => [k, { id: v.id, name: v.name }]));
  const out: SynthesizedSegment[] = [];

  for (const [index, seg] of input.block.segments.entries()) {
    const lines = seg.lines.map((l) => ({ speaker: l.speaker, text: l.text.trim() })).filter((l) => l.text);
    const characters = lines.reduce((n, l) => n + l.text.length, 0);
    let audio: Buffer;
    if (fakeVoice()) {
      audio = silenceMp3(Math.max(1000, characters * 60));
    } else {
      const parts: Buffer[] = [];
      for (const chunk of chunkLines(lines, maxChars)) {
        const r = await textToDialogue({
          inputs: chunk.map((l) => ({ text: l.text, voiceId: (cast[l.speaker] ?? cast.NARRATOR).id })),
          languageCode: input.language,
        });
        parts.push(r.audio);
      }
      audio = concatMp3(parts);
    }
    const durationMs = mp3DurationMs(audio);
    const storageKey = storageKeys.bankAudio(input.exam, input.itemSetId, index);
    await storage().put(storageKey, audio, "audio/mpeg");

    const ttsCost = fakeVoice() ? BigInt(0) : await ttsCostMicroUsd(characters);
    let transcriptCheck = 1;
    let sttCost = BigInt(0);
    if (!fakeVoice()) {
      await recordAiUsage({ provider: "elevenlabs", model: "text-to-dialogue", purpose: "bank.audio", characters, costMicroUsd: ttsCost, refId: input.itemSetId });
      const t = await speechToText({
        audio: new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }),
        filename: `segment-${index}.mp3`,
        timeoutMs: 180_000,
      });
      transcriptCheck = scriptMatch(lines.map((l) => l.text).join(" "), t.text);
      sttCost = await sttCostMicroUsd(durationMs / 1000);
      await recordAiUsage({ provider: "elevenlabs", model: "scribe", purpose: "bank.audio.check", seconds: Math.round(durationMs / 1000), costMicroUsd: sttCost, refId: input.itemSetId });
    }
    out.push({ index, storageKey, durationMs, voices, script: lines, transcriptCheck, characters, costMicroUsd: ttsCost + sttCost });
  }
  return out;
}
