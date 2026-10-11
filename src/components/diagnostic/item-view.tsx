"use client";

import { HeadphonesIcon, Volume2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import type { DiagnosticState } from "./api";

const SKILL_LABEL: Record<string, string> = {
  GRAMMAR: "Gramática",
  VOCAB: "Vocabulario",
  READING: "Lectura",
  LISTENING: "Escucha",
};

const MAX_PLAYS = 2;

export function ItemView({
  state,
  pending,
  locale,
  onAnswer,
}: {
  state: Extract<DiagnosticState, { phase: "ITEMS" }>;
  pending: boolean;
  locale: string;
  onAnswer: (itemId: string, index: number, latencyMs: number) => void;
}) {
  const { item } = state;
  const shownAt = useRef(Date.now());
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    shownAt.current = Date.now();
    setPlays(0);
    setChosen(null);
    return () => {
      audioRef.current?.pause();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, [item.id]);

  function play() {
    if (plays >= MAX_PLAYS || playing) return;
    setPlays((p) => p + 1);
    setPlaying(true);
    if (item.audioUrl) {
      const audio = new Audio(item.audioUrl);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      audio.onerror = () => {
        setPlaying(false);
        speakFallback();
      };
      void audio.play().catch(() => {
        setPlaying(false);
      });
    } else {
      speakFallback();
    }
  }

  function speakFallback() {
    if (!item.audioText || typeof window === "undefined" || !window.speechSynthesis) {
      setPlaying(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(item.audioText);
    u.lang = locale;
    u.rate = 0.9;
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang === locale);
    if (voice) u.voice = voice;
    u.onend = () => setPlaying(false);
    window.speechSynthesis.speak(u);
  }

  const isListening = item.skill === "LISTENING";
  const progress = Math.min(100, Math.round((state.answered / state.maxItems) * 100));

  return (
    <div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Pregunta {state.answered + 1}</span>
        <span className="rounded-full bg-secondary px-3 py-1 font-medium text-secondary-foreground">
          {SKILL_LABEL[item.skill]}
        </span>
      </div>
      <Progress value={progress} className="mt-3" />

      <div className="mt-8 rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
        {isListening && (
          <div className="mb-6 flex flex-col items-center gap-3">
            <button
              onClick={play}
              disabled={plays >= MAX_PLAYS || playing}
              className={cn(
                "grid size-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 disabled:opacity-50",
                playing && "animate-pulse",
              )}
              aria-label="Reproducir audio"
            >
              {playing ? <Volume2Icon className="size-9" /> : <HeadphonesIcon className="size-9" />}
            </button>
            <p className="text-sm text-muted-foreground">
              {plays === 0 ? "Toca para escuchar" : `Puedes escuchar ${MAX_PLAYS - plays} ${MAX_PLAYS - plays === 1 ? "vez" : "veces"} más`}
            </p>
          </div>
        )}
        {item.passage && (
          <blockquote className="mb-6 rounded-2xl bg-muted/60 p-4 text-base leading-relaxed" lang={locale}>
            {item.passage}
          </blockquote>
        )}
        <p className="font-heading text-xl font-bold sm:text-2xl" lang={isListening || item.passage ? "es" : locale}>
          {item.stem}
        </p>
        <div className="mt-6 grid gap-3">
          {item.options.map((opt, i) => (
            <button
              key={`${item.id}-${i}`}
              disabled={pending || (isListening && plays === 0)}
              onClick={() => {
                setChosen(i);
                onAnswer(item.id, i, Date.now() - shownAt.current);
              }}
              className={cn(
                "rounded-2xl border-2 px-5 py-4 text-left text-base font-medium transition-all hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60",
                chosen === i && "border-primary bg-primary/10",
              )}
            >
              <span className="mr-3 inline-grid size-7 place-items-center rounded-full bg-muted text-sm font-bold">
                {String.fromCharCode(65 + i)}
              </span>
              {opt}
            </button>
          ))}
        </div>
        {isListening && plays === 0 && (
          <p className="mt-4 text-center text-xs text-muted-foreground">Escucha el audio para poder responder.</p>
        )}
      </div>
    </div>
  );
}
