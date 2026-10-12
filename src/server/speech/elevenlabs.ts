/**
 * Cliente minimo de ElevenLabs.
 *  - textToSpeech: solo lo usa el script de generacion OFFLINE (los MP3 se sirven estaticos).
 *  - textToDialogue: audios de Listening del banco de examenes (varias voces).
 *  - speechToText (Scribe v2): transcribe las respuestas habladas del test (~$0,002 por test)
 *    y verifica los audios del banco contra su guion.
 *
 * La clave SOLO se lee de process.env.ELEVENLABS_API_KEY y nunca se imprime.
 */
const API = "https://api.elevenlabs.io/v1";

export class ElevenLabsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ElevenLabsError";
  }
}

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new ElevenLabsError("Falta ELEVENLABS_API_KEY en .env", 0);
  return key;
}

async function errorText(res: Response) {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "(sin cuerpo)";
  }
}

export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style?: number;
  use_speaker_boost?: boolean;
  speed?: number;
}

export async function textToSpeech(input: {
  text: string;
  voiceId: string;
  languageCode?: string;
  settings?: VoiceSettings;
  modelId?: string;
}): Promise<Buffer> {
  const body: Record<string, unknown> = {
    text: input.text,
    model_id: input.modelId ?? "eleven_multilingual_v2",
    voice_settings: input.settings ?? { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
  };
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${API}/text-to-speech/${input.voiceId}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": apiKey(), "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const detail = await errorText(res);
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    throw new ElevenLabsError(`ElevenLabs TTS ${res.status}: ${detail}`, res.status);
  }
  throw new ElevenLabsError("ElevenLabs TTS fallo tras varios intentos", 503);
}

/**
 * Text to Dialogue: varias voces en una sola pista (hasta ~2.000 caracteres por
 * solicitud; los guiones largos se parten y se unen). El modelo se elige en
 * ELEVENLABS_DIALOGUE_MODEL; vacio = el modelo por defecto de ElevenLabs.
 */
export async function textToDialogue(input: {
  inputs: { text: string; voiceId: string }[];
  languageCode?: string;
  seed?: number;
}): Promise<{ audio: Buffer; requestId: string | null }> {
  const body: Record<string, unknown> = {
    inputs: input.inputs.map((i) => ({ text: i.text, voice_id: i.voiceId })),
  };
  const model = process.env.ELEVENLABS_DIALOGUE_MODEL?.trim();
  if (model) body.model_id = model;
  if (input.languageCode) body.language_code = input.languageCode;
  if (input.seed !== undefined) body.seed = input.seed;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${API}/text-to-dialogue?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey(), "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    if (res.ok) return { audio: Buffer.from(await res.arrayBuffer()), requestId: res.headers.get("request-id") };
    const detail = await errorText(res);
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
      continue;
    }
    throw new ElevenLabsError(`ElevenLabs dialogo ${res.status}: ${detail}`, res.status);
  }
  throw new ElevenLabsError("ElevenLabs dialogo fallo tras varios intentos", 503);
}

export interface Transcription {
  text: string;
  languageCode: string;
  languageProbability: number;
  /** segundo final de la ultima palabra (aprox. duracion hablada) */
  spokenSeconds: number;
}

export async function speechToText(input: {
  audio: Blob;
  filename: string;
  languageCode?: "en" | "de";
  timeoutMs?: number;
}): Promise<Transcription> {
  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("file", input.audio, input.filename);
  // No se fija el idioma: queremos detectar si la persona respondio en español.
  form.append("tag_audio_events", "false");
  form.append("timestamps_granularity", "word");

  const res = await fetch(`${API}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": apiKey() },
    body: form,
    signal: AbortSignal.timeout(input.timeoutMs ?? 45_000),
  });
  if (!res.ok) throw new ElevenLabsError(`ElevenLabs STT ${res.status}: ${await errorText(res)}`, res.status);
  const data = (await res.json()) as {
    text?: string;
    language_code?: string;
    language_probability?: number;
    words?: { type?: string; end?: number | null }[];
  };
  const ends = (data.words ?? []).filter((w) => w.type === "word" && typeof w.end === "number").map((w) => w.end!);
  return {
    text: (data.text ?? "").trim(),
    languageCode: (data.language_code ?? "").toLowerCase(),
    languageProbability: data.language_probability ?? 0,
    spokenSeconds: ends.length ? Math.max(...ends) : 0,
  };
}

/** ¿El idioma detectado coincide con el esperado? (Scribe puede dar "en"/"eng", "de"/"deu") */
export function languageMatches(detected: string, expected: "en" | "de"): boolean {
  const d = detected.toLowerCase();
  if (expected === "en") return d === "en" || d === "eng";
  return d === "de" || d === "deu" || d === "ger";
}
