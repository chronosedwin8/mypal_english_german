"use client";

import { Loader2Icon, MicIcon, SquareIcon, Volume2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SpeakingState } from "@/server/exams/speaking";

type Phase = "mic" | "listening" | "prep" | "recording" | "sending" | "done" | "error";

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return undefined;
}

/**
 * Sala de Speaking con examinador por voz: la pregunta suena, la grabacion empieza
 * sola al terminar y se corta en el tiempo maximo. En la Parte 2 hay un minuto para
 * preparar con notas y luego hasta dos minutos de habla.
 */
export function SpeakingRoom({ initial }: { initial: SpeakingState }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [phase, setPhase] = useState<Phase>("mic");
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [showText, setShowText] = useState(true);
  const [notes, setNotes] = useState("");
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const startedAt = useRef(0);
  const runTurnRef = useRef<(s: SpeakingState) => void>(() => undefined);

  const waiting = state.current?.waiting ?? null;
  const longTurn = waiting?.expects === "longturn";

  const send = useCallback(
    async (blob: Blob, durationMs: number) => {
      setPhase("sending");
      const form = new FormData();
      form.append("audio", blob, "answer");
      form.append("durationMs", String(durationMs));
      const res = await fetch(`/api/exams/speaking/${state.attemptId}/turn`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "No pudimos enviar tu respuesta.");
        setPhase("error");
        return;
      }
      setNotes("");
      runTurnRef.current(data as SpeakingState);
    },
    [state.attemptId],
  );

  const startRecording = useCallback(
    (maxSeconds: number) => {
      if (!stream.current) return;
      const mimeType = pickMime();
      const chunks: Blob[] = [];
      const r = new MediaRecorder(stream.current, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => void send(new Blob(chunks, { type: r.mimeType || "audio/webm" }), Date.now() - startedAt.current);
      recorder.current = r;
      startedAt.current = Date.now();
      r.start(1000);
      setLeft(maxSeconds);
      setPhase("recording");
    },
    [send],
  );

  const stopRecording = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  // Cada pregunta nueva: suena y luego se responde (se llama desde eventos, no desde efectos).
  const runTurn = useCallback(
    (next: SpeakingState) => {
      setState(next);
      if (!next.current) {
        setPhase("done");
        if (next.closingAudioUrl && audio.current) {
          audio.current.src = next.closingAudioUrl;
          void audio.current.play().catch(() => undefined);
        }
        setTimeout(() => router.refresh(), 2500);
        return;
      }
      const w = next.current.waiting;
      if (!w || w.expects === "end") return;
      setPhase("listening");
      const a = audio.current;
      const afterAudio = () => {
        if (w.expects === "longturn") {
          setLeft(next.limits.prepSeconds);
          setPhase("prep");
        } else startRecording(next.limits.answerSeconds);
      };
      if (!a || !w.audioUrl) {
        afterAudio();
        return;
      }
      a.onended = afterAudio;
      a.src = w.audioUrl;
      a.play().catch(afterAudio);
    },
    [router, startRecording],
  );
  useEffect(() => {
    runTurnRef.current = runTurn;
  }, [runTurn]);

  // Cuenta regresiva de preparacion y de grabacion.
  useEffect(() => {
    if (phase !== "prep" && phase !== "recording") return;
    if (left <= 0) {
      const t = setTimeout(() => (phase === "prep" ? startRecording(state.limits.longTurnSeconds) : stopRecording()), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, left, startRecording, stopRecording, state.limits.longTurnSeconds]);

  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const enableMic = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      runTurn(state);
    } catch {
      setError("Necesitamos tu micrófono para el Speaking. Revisa el permiso del navegador.");
    }
  };

  const total = phase === "prep" ? state.limits.prepSeconds : longTurn ? state.limits.longTurnSeconds : state.limits.answerSeconds;

  return (
    <div className="space-y-6">
      <audio ref={audio} className="hidden" />
      <div className="flex flex-wrap items-center gap-3">
        {state.parts.map((p) => (
          <span
            key={p.part}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-semibold",
              state.current?.part === p.part ? "border-primary bg-primary text-primary-foreground" : p.status === "IN_PROGRESS" ? "bg-card" : "bg-muted text-muted-foreground",
            )}
          >
            Part {p.part}
          </span>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showText} onCheckedChange={setShowText} /> Ver texto de las preguntas
        </label>
      </div>

      {phase === "mic" && (
        <div className="rounded-3xl border bg-card p-8 text-center">
          <MicIcon className="mx-auto size-10 text-primary" />
          <p className="mt-4 font-heading text-xl font-bold">Activa tu micrófono</p>
          <p className="mx-auto mt-1 max-w-md text-muted-foreground">
            El examinador te hará preguntas en voz alta. Tu respuesta se graba sola cuando termina la pregunta; pulsa “Terminé” cuando acabes.
          </p>
          <Button type="button" className="mt-5" onClick={enableMic}>
            <MicIcon /> Activar y empezar
          </Button>
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        </div>
      )}

      {phase !== "mic" && state.current && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {longTurn && state.current.card && (phase === "prep" || phase === "recording" || phase === "sending") && (
              <div className="rounded-3xl border-2 border-dashed border-primary/40 bg-card p-6">
                <p className="font-heading text-lg font-bold">{state.current.card.task}</p>
                <p className="mt-3 text-sm font-semibold">You should say:</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {state.current.card.cuePoints.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <p className="mt-3">{state.current.card.finalLine}</p>
                {phase === "prep" && (
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tus notas (solo para ti)…" rows={4} className="mt-4" spellCheck={false} />
                )}
              </div>
            )}

            <div className="rounded-3xl border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className={cn("grid size-12 place-items-center rounded-full", phase === "recording" ? "animate-pulse bg-rose-500 text-white" : "bg-primary/10 text-primary")}>
                  {phase === "recording" ? <MicIcon /> : phase === "sending" ? <Loader2Icon className="animate-spin" /> : <Volume2Icon />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {phase === "listening" && "El examinador pregunta…"}
                    {phase === "prep" && `Prepárate · ${left} s`}
                    {phase === "recording" && `Grabando tu respuesta · ${left} s`}
                    {phase === "sending" && "Escuchando tu respuesta…"}
                    {phase === "error" && "Algo falló"}
                  </p>
                  {(phase === "prep" || phase === "recording") && <Progress value={(left / total) * 100} className="mt-2 h-1.5" />}
                </div>
                {phase === "prep" && (
                  <Button type="button" variant="outline" onClick={() => setLeft(0)}>
                    Empezar a hablar
                  </Button>
                )}
                {phase === "recording" && (
                  <Button type="button" onClick={stopRecording}>
                    <SquareIcon /> Terminé
                  </Button>
                )}
              </div>
              {showText && waiting && <p className="mt-4 rounded-2xl bg-muted/50 p-4 text-[15px] leading-relaxed">{waiting.text}</p>}
              {phase === "error" && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-rose-600">{error}</p>
                  <Button type="button" variant="outline" onClick={() => router.refresh()}>
                    Reintentar
                  </Button>
                </div>
              )}
            </div>
          </div>

          <aside className="rounded-3xl border bg-card p-4">
            <p className="text-sm font-semibold">Conversación</p>
            <ol className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto text-sm">
              {state.current.history.slice(0, -1).map((h, i) => (
                <li key={i} className={cn("rounded-xl px-3 py-2", h.who === "examiner" ? "bg-muted/60" : "bg-primary/10")}>
                  <span className="text-xs font-semibold text-muted-foreground">{h.who === "examiner" ? "Examinador" : "Tú"}</span>
                  <p>{h.text || "(sin respuesta)"}</p>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-3xl border bg-card p-8 text-center">
          <Loader2Icon className="mx-auto size-8 animate-spin text-primary" />
          <p className="mt-4 font-heading text-xl font-bold">¡Terminaste! Estamos calificando tu Speaking…</p>
        </div>
      )}
    </div>
  );
}
