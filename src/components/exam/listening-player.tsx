"use client";

import { HeadphonesIcon, PauseIcon, PlayIcon, RotateCcwIcon, SkipForwardIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export interface PlayerSegment {
  blockId: string;
  index: number;
  questionsFrom: number;
  questionsTo: number;
  durationMs: number;
}

type Phase = { kind: "idle" } | { kind: "reading"; seg: number; left: number } | { kind: "loading"; seg: number } | { kind: "playing"; seg: number } | { kind: "done" };

/**
 * Reproductor de Listening como en el examen: antes de cada tramo hay tiempo para leer
 * las preguntas; el audio no se puede adelantar. En practica por tipo (`free`) se puede
 * pausar, repetir y saltar la lectura.
 */
export function ListeningPlayer(props: {
  segments: PlayerSegment[];
  readSeconds: number;
  free: boolean;
  disabled?: boolean;
  getUrl: (blockId: string, index: number) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  onSegment?: (seg: PlayerSegment | null) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { segments, readSeconds, getUrl, onSegment } = props;

  const play = useCallback(
    async (seg: number) => {
      if (seg >= segments.length) {
        setPhase({ kind: "done" });
        onSegment?.(null);
        return;
      }
      setPhase({ kind: "loading", seg });
      const s = segments[seg];
      const r = await getUrl(s.blockId, s.index);
      if (!r.ok) {
        setError(r.error);
        setPhase({ kind: "reading", seg: seg + 1, left: 0 });
        return;
      }
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = r.url;
      setProgress(0);
      setPaused(false);
      try {
        await audio.play();
        setPhase({ kind: "playing", seg });
      } catch {
        setError("Tu navegador bloqueó el audio. Pulsa reproducir de nuevo.");
        setPhase({ kind: "reading", seg, left: 0 });
      }
    },
    [segments, getUrl, onSegment],
  );

  // Cuenta regresiva de lectura antes de cada tramo.
  useEffect(() => {
    if (phase.kind !== "reading") return;
    if (phase.seg < segments.length) onSegment?.(segments[phase.seg]);
    if (phase.left <= 0) {
      const t = setTimeout(() => void play(phase.seg), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPhase({ ...phase, left: phase.left - 1 }), 1000);
    return () => clearTimeout(t);
  }, [phase, play, segments, onSegment]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    const onEnded = () =>
      setPhase((p) => (p.kind === "playing" ? { kind: "reading", seg: p.seg + 1, left: p.seg + 1 < segments.length ? readSeconds : 0 } : p));
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
    };
  }, [segments.length, readSeconds]);

  useEffect(() => {
    if (props.disabled) audioRef.current?.pause();
  }, [props.disabled]);

  const current = phase.kind === "reading" || phase.kind === "loading" || phase.kind === "playing" ? segments[phase.seg] : null;

  return (
    <div className="rounded-2xl border bg-card p-4">
      {/* Sin controles nativos: no se puede adelantar ni retroceder. */}
      <audio ref={audioRef} preload="none" className="hidden" />
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
          <HeadphonesIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {phase.kind === "idle" && <p className="text-sm font-medium">Usa audífonos. {props.free ? "Puedes pausar y repetir." : "Cada grabación suena una sola vez."}</p>}
          {phase.kind === "reading" && current && (
            <p className="text-sm font-medium">
              Lee las preguntas {current.questionsFrom}–{current.questionsTo} · el audio empieza en <b className="tabular-nums">{phase.left} s</b>
            </p>
          )}
          {phase.kind === "loading" && <p className="text-sm font-medium">Cargando audio…</p>}
          {phase.kind === "playing" && current && (
            <p className="text-sm font-medium">
              Escuchando · preguntas {current.questionsFrom}–{current.questionsTo}
            </p>
          )}
          {phase.kind === "done" && <p className="text-sm font-medium">Terminó el audio. Revisa tus respuestas y entrega.</p>}
          {(phase.kind === "playing" || phase.kind === "loading") && <Progress value={progress} className="mt-2 h-1.5" />}
          {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
        </div>
        {phase.kind === "idle" && (
          <Button type="button" disabled={props.disabled || !segments.length} onClick={() => setPhase({ kind: "reading", seg: 0, left: readSeconds })}>
            <PlayIcon /> Empezar
          </Button>
        )}
        {phase.kind === "reading" && props.free && phase.left > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => setPhase({ ...phase, left: 0 })}>
            <SkipForwardIcon /> Empezar ya
          </Button>
        )}
        {phase.kind === "playing" && props.free && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const a = audioRef.current;
                if (!a) return;
                if (a.paused) void a.play();
                else a.pause();
                setPaused(a.paused);
              }}
            >
              {paused ? <PlayIcon /> : <PauseIcon />} {paused ? "Seguir" : "Pausa"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const a = audioRef.current;
                if (a) a.currentTime = 0;
              }}
            >
              <RotateCcwIcon /> Repetir
            </Button>
          </>
        )}
        {phase.kind === "done" && props.free && (
          <Button type="button" variant="outline" size="sm" onClick={() => setPhase({ kind: "reading", seg: 0, left: 0 })}>
            <RotateCcwIcon /> Escuchar otra vez
          </Button>
        )}
      </div>
    </div>
  );
}
