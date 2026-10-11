"use client";

import { Loader2Icon, MicIcon, RotateCcwIcon, SendIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { DiagnosticState } from "./api";

type Rec = "idle" | "recording" | "recorded";

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export function SpeakingView({
  state,
  pending,
  onSubmit,
  onSkip,
}: {
  state: Extract<DiagnosticState, { phase: "SPEAKING" }>;
  pending: boolean;
  onSubmit: (blob: Blob, durationMs: number) => void;
  onSkip: () => void;
}) {
  const { task } = state;
  const [rec, setRec] = useState<Rec>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [blob, setBlob] = useState<{ data: Blob; ms: number; url: string } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = () => {
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  // El padre monta una vista nueva por tarea (key = task.id); al salir se libera el microfono.
  useEffect(() => cleanup, []);

  async function start() {
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("No pudimos usar tu micrófono. Revisa el permiso del navegador o salta esta parte.");
      return;
    }
    const mimeType = pickMime();
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream.current, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      const ms = Date.now() - startedAt.current;
      const data = new Blob(chunks, { type: r.mimeType || "audio/webm" });
      setBlob({ data, ms, url: URL.createObjectURL(data) });
      setRec("recorded");
      cleanup();
    };
    recorder.current = r;
    startedAt.current = Date.now();
    setElapsed(0);
    r.start(250);
    setRec("recording");
    timer.current = setInterval(() => {
      const s = (Date.now() - startedAt.current) / 1000;
      setElapsed(s);
      if (s >= task.maxSeconds) stop();
    }, 200);
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  const remaining = Math.max(0, task.maxSeconds - elapsed);

  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">
        Parte oral · {state.index} de {state.total}
      </p>
      <div className="mt-4 rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-primary">{task.instructionEs}</p>
        <p className="mt-3 font-heading text-2xl font-bold leading-snug sm:text-3xl" lang="en">
          {task.kind === "READ_ALOUD" ? `“${task.text}”` : task.text}
        </p>

        <div className="mt-8 flex flex-col items-center gap-4">
          {rec === "recording" ? (
            <>
              <button
                onClick={stop}
                className="relative grid size-24 place-items-center rounded-full bg-coral text-white shadow-xl"
                aria-label="Detener grabación"
              >
                <span className="absolute inset-0 animate-ping rounded-full bg-coral/40" />
                <SquareIcon className="relative size-9" />
              </button>
              <p className="font-mono text-lg tabular-nums">0:{String(Math.ceil(remaining)).padStart(2, "0")}</p>
            </>
          ) : rec === "recorded" && blob ? (
            <>
              <audio controls src={blob.url} className="w-full max-w-sm" />
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="outline" onClick={start} disabled={pending} className="h-11 rounded-full px-5">
                  <RotateCcwIcon /> Grabar otra vez
                </Button>
                <Button onClick={() => onSubmit(blob.data, blob.ms)} disabled={pending} className="h-11 rounded-full px-6">
                  {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Enviar
                </Button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={start}
                disabled={pending}
                className={cn(
                  "grid size-24 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105",
                )}
                aria-label="Empezar a grabar"
              >
                <MicIcon className="size-10" />
              </button>
              <p className="text-sm text-muted-foreground">Toca y habla. Máximo {task.maxSeconds} segundos.</p>
            </>
          )}
        </div>
        {error && (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      <div className="mt-4 text-center">
        <button onClick={onSkip} disabled={pending} className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline">
          Saltar la parte oral y ver mi resultado
        </button>
      </div>
    </div>
  );
}
