"use client";

import { PauseIcon, PlayIcon } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState } from "react";

import { Flag } from "@/components/flag";
import { speakingAudioPath } from "@/lib/voices";
import { cn } from "@/lib/utils";

/** Escucha la diferencia: la misma idea con tres acentos (audios ya generados con ElevenLabs). */
const ACCENTS = [
  {
    id: "us",
    flag: "US" as const,
    title: "Inglés americano",
    src: speakingAudioPath("EN_US", "en-read-low"),
    line: "I like to drink coffee in the morning with my family.",
    words: ["elevator", "apartment", "cell phone", "fall"],
    tone: "from-sky/40",
  },
  {
    id: "uk",
    flag: "GB" as const,
    title: "Inglés británico",
    src: speakingAudioPath("EN_GB", "en-read-low"),
    line: "I like to drink coffee in the morning with my family.",
    words: ["lift", "flat", "mobile", "autumn"],
    tone: "from-coral/30",
  },
  {
    id: "de",
    flag: "DE" as const,
    title: "Alemán",
    src: speakingAudioPath("DE", "de-read-low"),
    line: "Ich trinke morgens gern Kaffee mit meiner Familie.",
    words: ["der Aufzug", "die Wohnung", "das Handy", "der Herbst"],
    tone: "from-sun/40",
  },
];

export function AccentPlayer() {
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  function toggle(id: string, src: string) {
    audio.current?.pause();
    if (playing === id) {
      setPlaying(null);
      return;
    }
    const a = new Audio(src);
    audio.current = a;
    a.onended = () => setPlaying(null);
    void a.play().then(() => setPlaying(id)).catch(() => setPlaying(null));
  }

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {ACCENTS.map((a) => {
        const on = playing === a.id;
        return (
          <div key={a.id} className={cn("rounded-3xl border bg-gradient-to-b to-card p-6 transition-shadow", a.tone, on && "shadow-xl ring-2 ring-primary")}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-heading text-lg font-bold">
                <Flag code={a.flag} className="h-5" /> {a.title}
              </span>
              <button
                onClick={() => toggle(a.id, a.src)}
                aria-label={on ? `Pausar ${a.title}` : `Escuchar ${a.title}`}
                className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
              >
                {on ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5 translate-x-px" />}
              </button>
            </div>
            <div className="mt-4 flex h-8 items-center gap-1" aria-hidden="true">
              {Array.from({ length: 28 }).map((_, i) => (
                <motion.span
                  key={i}
                  className="w-1 rounded-full bg-primary/60"
                  animate={on ? { height: [6, 8 + ((i * 7) % 22), 6] } : { height: 6 }}
                  transition={{ duration: 0.6 + (i % 5) * 0.1, repeat: on ? Infinity : 0 }}
                />
              ))}
            </div>
            <p className="mt-4 text-sm font-medium italic">“{a.line}”</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {a.words.map((w) => (
                <span key={w} className="rounded-full bg-card/80 px-2.5 py-1 text-xs font-semibold shadow-sm">
                  {w}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
