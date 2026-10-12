/**
 * Utilidades MP3 sin dependencias: recorrer cuadros, medir duracion y unir tramos.
 * ElevenLabs entrega MP3 CBR; al unir tramos se quitan las etiquetas ID3 y los
 * cuadros Xing/Info (si no, el navegador calcularia mal la duracion).
 */

const BITRATES: Record<string, number[]> = {
  // MPEG-1 Layer III
  "1": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  // MPEG-2 / 2.5 Layer III
  "2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
};
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

export interface Mp3Frame {
  offset: number;
  length: number;
  sampleRate: number;
  samples: number;
  /** cuadro de cabecera Xing/Info/VBRI (sin audio) */
  isInfo: boolean;
}

function skipId3(buf: Buffer, at: number): number {
  if (buf.length >= at + 10 && buf.toString("latin1", at, at + 3) === "ID3") {
    const size = ((buf[at + 6] & 0x7f) << 21) | ((buf[at + 7] & 0x7f) << 14) | ((buf[at + 8] & 0x7f) << 7) | (buf[at + 9] & 0x7f);
    const footer = buf[at + 5] & 0x10 ? 10 : 0;
    return at + 10 + size + footer;
  }
  return at;
}

function parseHeader(buf: Buffer, i: number): Omit<Mp3Frame, "offset" | "isInfo"> & { mono: boolean; mpeg1: boolean } | null {
  if (i + 4 > buf.length || buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return null;
  const version = (buf[i + 1] >> 3) & 0x03; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
  const layer = (buf[i + 1] >> 1) & 0x03; // 1 = Layer III
  if (version === 1 || layer !== 1) return null;
  const bitrateIndex = (buf[i + 2] >> 4) & 0x0f;
  const srIndex = (buf[i + 2] >> 2) & 0x03;
  if (srIndex === 3) return null;
  const mpeg1 = version === 3;
  const bitrate = BITRATES[mpeg1 ? "1" : "2"][bitrateIndex] * 1000;
  if (!bitrate) return null;
  const sampleRate = SAMPLE_RATES[version][srIndex];
  const padding = (buf[i + 2] >> 1) & 0x01;
  const samples = mpeg1 ? 1152 : 576;
  const length = Math.floor(((samples / 8) * bitrate) / sampleRate) + padding;
  const mono = ((buf[i + 3] >> 6) & 0x03) === 3;
  return { length, sampleRate, samples, mono, mpeg1 };
}

export function mp3Frames(buf: Buffer): Mp3Frame[] {
  const frames: Mp3Frame[] = [];
  let i = skipId3(buf, 0);
  while (i + 4 <= buf.length) {
    const h = parseHeader(buf, i);
    if (!h || h.length < 4 || i + h.length > buf.length) {
      // basura o etiqueta en medio: avanzar al siguiente posible cuadro
      const next = skipId3(buf, i);
      i = next > i ? next : i + 1;
      continue;
    }
    const side = h.mpeg1 ? (h.mono ? 17 : 32) : h.mono ? 9 : 17;
    const tag = buf.toString("latin1", i + 4 + side, i + 8 + side);
    const isInfo = tag === "Xing" || tag === "Info" || buf.toString("latin1", i + 36, i + 40) === "VBRI";
    frames.push({ offset: i, length: h.length, sampleRate: h.sampleRate, samples: h.samples, isInfo });
    i += h.length;
  }
  return frames;
}

export function mp3DurationMs(buf: Buffer): number {
  let seconds = 0;
  for (const f of mp3Frames(buf)) if (!f.isInfo) seconds += f.samples / f.sampleRate;
  return Math.round(seconds * 1000);
}

/** Une varios MP3 en uno solo, conservando solo los cuadros de audio. */
export function concatMp3(parts: Buffer[]): Buffer {
  const chunks: Buffer[] = [];
  for (const p of parts) for (const f of mp3Frames(p)) if (!f.isInfo) chunks.push(p.subarray(f.offset, f.offset + f.length));
  return Buffer.concat(chunks);
}

/**
 * MP3 de silencio (cuadros MPEG-1 128 kbps 44,1 kHz mono sin datos de audio).
 * Lo usa el simulador de voz en pruebas.
 */
export function silenceMp3(ms: number): Buffer {
  const frameLen = 417; // 144 * 128000 / 44100, sin relleno
  const frame = Buffer.alloc(frameLen);
  frame[0] = 0xff;
  frame[1] = 0xfb; // MPEG-1, Layer III, sin CRC
  frame[2] = 0x90; // 128 kbps, 44,1 kHz
  frame[3] = 0xc4; // mono
  const count = Math.max(1, Math.round(ms / ((1152 / 44100) * 1000)));
  return Buffer.concat(Array.from({ length: count }, () => frame));
}
