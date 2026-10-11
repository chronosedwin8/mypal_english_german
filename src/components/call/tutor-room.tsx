"use client";

import {
  CameraIcon,
  CameraOffIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  MicIcon,
  MicOffIcon,
  MonitorUpIcon,
  PhoneOffIcon,
  SnailIcon,
  RepeatIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Turnstile } from "@/components/auth/turnstile";
import { Flag, FLAG_BY_LANGUAGE } from "@/components/flag";
import { TutorAvatar } from "@/components/marketing/tutor-avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { LANGUAGES, type LanguageCode } from "@/lib/site";
import { cn } from "@/lib/utils";
import type { SessionView } from "@/server/sessions/view";

import type { ToolCall } from "./types";
import { useDailyCall } from "./use-daily-call";
import { useMockCall } from "./use-mock-call";

type Phase = "preflight" | "starting" | "queued" | "call" | "ending";

const QUICK: Record<"EN" | "DE", { slower: string; repeat: string; howTo: (w: string) => string; wrap: string }> = {
  EN: {
    slower: "Could you speak a bit more slowly, please?",
    repeat: "Sorry, could you repeat that?",
    howTo: (w) => `How do you say "${w}" in English?`,
    wrap: "(Note for the tutor: we have about one minute left. Please give me a two-sentence recap of what went well and one thing to practise, then say goodbye.)",
  },
  DE: {
    slower: "Kannst du bitte etwas langsamer sprechen?",
    repeat: "Entschuldigung, kannst du das wiederholen?",
    howTo: (w) => `Wie sagt man "${w}" auf Deutsch?`,
    wrap: "(Note for the tutor: we have about one minute left. Please give me a two-sentence recap of what went well and one thing to practise, then say goodbye.)",
  },
};

function deviceId(): string {
  try {
    let id = localStorage.getItem("mypal:device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("mypal:device", id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function TutorRoom({
  language,
  lessonId,
  lessonTitle,
  userName,
  resumeSessionId,
}: {
  language: LanguageCode;
  lessonId: string | null;
  lessonTitle: string | null;
  userName: string;
  resumeSessionId: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("preflight");
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [queue, setQueue] = useState<{ entry: string; position: number } | null>(null);
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [howTo, setHowTo] = useState("");
  const offset = useRef(0);
  const idemKey = useRef<string>(crypto.randomUUID());
  const wrapSent = useRef(false);
  const ended = useRef(false);
  const leaveRef = useRef<() => Promise<void>>(async () => undefined);
  const onToken = useCallback((t: string | null) => setToken(t), []);
  const base = LANGUAGES[language].base;

  // ---------- fin de la clase (idempotente) ----------
  const finish = useCallback(
    async (reason: "USER_END" | "CLIENT_LEFT") => {
      if (ended.current || !session) return;
      ended.current = true;
      setPhase("ending");
      await leaveRef.current().catch(() => undefined);
      await fetch(`/api/sessions/${session.id}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, endToken: session.endToken }),
      }).catch(() => undefined);
      router.push(`/app/clase/${session.id}/resumen`);
      router.refresh();
    },
    [router, session],
  );

  const onToolCall = useCallback(
    (call: ToolCall) => {
      if (!session) return;
      void fetch(`/api/sessions/${session.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(call),
      });
      if (call.name === "save_vocabulary" && call.arguments.term) {
        toast.success(`📌 Nueva palabra: ${String(call.arguments.term)}`, {
          description: call.arguments.translation_es ? String(call.arguments.translation_es) : undefined,
        });
      }
    },
    [session],
  );

  const callOpts = {
    conversationId: session?.conversationId ?? null,
    conversationUrl: session?.conversationUrl ?? null,
    meetingToken: session?.meetingToken ?? null,
    userName,
    onJoined: () => {
      if (session) void fetch(`/api/sessions/${session.id}/joined`, { method: "POST" });
    },
    onLeft: () => void finish("CLIENT_LEFT"),
    onToolCall,
  };
  const daily = useDailyCall(callOpts);
  const mock = useMockCall(callOpts);
  const call = session?.driver === "http" ? daily : mock;
  leaveRef.current = call.leave;

  // ---------- vista previa de camara ----------
  useEffect(() => {
    if (phase !== "preflight") return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: true })
      .then((s) => {
        stream = s;
        setPreview(s);
      })
      .catch(() => setError("Necesitamos permiso para usar tu cámara y micrófono. Revísalo en el navegador."));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [phase]);

  // ---------- reanudar una clase abierta ----------
  const loadSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`, { cache: "no-store" });
    if (!res.ok) throw new Error("No encontramos la clase.");
    const view = (await res.json()) as SessionView;
    offset.current = new Date(view.serverNow).getTime() - Date.now();
    setSession(view);
    return view;
  }, []);

  useEffect(() => {
    if (!resumeSessionId) return;
    loadSession(resumeSessionId)
      .then((v) => {
        if (v.status === "READY" || v.status === "LIVE") setPhase("call");
        else router.replace(`/app/clase/${v.id}/resumen`);
      })
      .catch(() => undefined);
  }, [resumeSessionId, loadSession, router]);

  // ---------- empezar ----------
  const start = useCallback(
    async (queueEntryId?: string) => {
      setError(null);
      setPhase("starting");
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idemKey.current },
          body: JSON.stringify({ language, lessonId, queueEntryId, turnstileToken: token, deviceId: deviceId() }),
        });
        const data = await res.json();
        if (res.status === 409 && data?.error?.sessionId) {
          await loadSession(data.error.sessionId);
          setPhase("call");
          return;
        }
        if (!res.ok) {
          setError(data?.error?.message ?? "No pudimos empezar la clase.");
          if (res.status === 402) setTimeout(() => router.push("/app/planes?motivo=sin-minutos"), 1500);
          setPhase("preflight");
          idemKey.current = crypto.randomUUID();
          return;
        }
        if (data.queued) {
          setQueue({ entry: data.queueEntryId, position: data.position });
          setPhase("queued");
          idemKey.current = crypto.randomUUID();
          return;
        }
        preview?.getTracks().forEach((t) => t.stop());
        offset.current = new Date(data.session.serverNow).getTime() - Date.now();
        setSession(data.session);
        setPhase("call");
      } catch {
        setError("No pudimos conectar. Revisa tu internet e inténtalo de nuevo.");
        setPhase("preflight");
      }
    },
    [language, lessonId, token, loadSession, preview, router],
  );

  // ---------- cola ----------
  useEffect(() => {
    if (phase !== "queued" || !queue) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/queue?entry=${queue.entry}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { status: string; position: number };
      if (data.status === "OFFERED") {
        clearInterval(t);
        void start(queue.entry);
      } else if (data.status === "WAITING") {
        setQueue((q) => (q ? { ...q, position: data.position } : q));
      } else {
        clearInterval(t);
        setPhase("preflight");
      }
    }, 3000);
    return () => clearInterval(t);
  }, [phase, queue, start]);

  // ---------- en la llamada ----------
  useEffect(() => {
    if (phase === "call" && session && call.status === "idle") void call.join();
  }, [phase, session, call]);

  useEffect(() => {
    if (phase !== "call" || !session) return;
    const hb = setInterval(() => void fetch(`/api/sessions/${session.id}/heartbeat`, { method: "POST" }), 15_000);
    const onHide = () => {
      if (ended.current) return;
      navigator.sendBeacon(
        `/api/sessions/${session.id}/end`,
        new Blob([JSON.stringify({ reason: "TAB_CLOSE", endToken: session.endToken })], { type: "application/json" }),
      );
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(hb);
      window.removeEventListener("pagehide", onHide);
    };
  }, [phase, session]);

  useEffect(() => {
    if (phase !== "call" || !session?.hardDeadlineAt) return;
    const deadline = new Date(session.hardDeadlineAt).getTime();
    const wrapAt = session.isTrial ? 30 : 60;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.round((deadline - (Date.now() + offset.current)) / 1000));
      setRemaining(left);
      if (left <= wrapAt && !wrapSent.current && call.status === "joined") {
        wrapSent.current = true;
        call.say(QUICK[base].wrap);
      }
      if (left <= 0) {
        clearInterval(tick);
        void finish("CLIENT_LEFT");
      }
    }, 500);
    return () => clearInterval(tick);
  }, [phase, session, call, base, finish]);

  // ---------- UI ----------
  if (phase === "preflight" || phase === "starting") {
    return (
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="relative aspect-video overflow-hidden rounded-3xl bg-[#1b1430] shadow-xl">
          {preview ? (
            <video
              autoPlay
              muted
              playsInline
              className="h-full w-full -scale-x-100 object-cover"
              ref={(el) => {
                if (el && el.srcObject !== preview) el.srcObject = preview;
              }}
            />
          ) : (
            <div className="grid h-full place-items-center text-white/70">
              <CameraIcon className="size-10" />
            </div>
          )}
          <span className="absolute left-4 top-4 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
            Así te verá tu tutora
          </span>
        </div>
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Flag code={FLAG_BY_LANGUAGE[language]} /> {LANGUAGES[language].label}
          </p>
          <h1 className="mt-2 font-heading text-3xl font-extrabold tracking-tight">{lessonTitle ?? "Conversación libre"}</h1>
          <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
            <li>🎧 Usa audífonos para que tu tutora te escuche mejor.</li>
            <li>💡 Busca buena luz: así te ve mejor cuando le muestras objetos.</li>
            <li>⏱️ El tiempo cuenta desde que empieza la llamada.</li>
          </ul>
          <label className="mt-6 flex items-start gap-3 rounded-2xl border bg-card p-4 text-sm">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(Boolean(v))} className="mt-0.5" />
            <span>
              Acepto que mi tutora de IA vea mi cámara durante la clase para conversar sobre lo que le muestro. La clase no se
              graba.
            </span>
          </label>
          <div className="mt-4">
            <Turnstile onToken={onToken} action="start-class" />
          </div>
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            className="mt-5 h-12 w-full rounded-full text-base"
            disabled={!consent || !preview || phase === "starting"}
            onClick={() => start()}
          >
            {phase === "starting" ? <Loader2Icon className="animate-spin" /> : null}
            {phase === "starting" ? "Conectando con tu tutora…" : "Empezar la clase"}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "queued") {
    return (
      <div className="mx-auto max-w-md pt-10 text-center">
        <div className="mx-auto size-40">
          <TutorAvatar />
        </div>
        <h1 className="mt-4 font-heading text-2xl font-extrabold">Todas las tutoras están en clase</h1>
        <p className="mt-2 text-muted-foreground">
          Estás en el puesto <strong className="text-foreground">{queue?.position ?? "…"}</strong> de la fila. Mantén esta
          pestaña abierta: entrarás automáticamente.
        </p>
        <Loader2Icon className="mx-auto mt-6 size-6 animate-spin text-primary" />
        <Button
          variant="ghost"
          className="mt-6"
          onClick={async () => {
            if (queue) await fetch(`/api/queue?entry=${queue.entry}`, { method: "DELETE" });
            setPhase("preflight");
          }}
        >
          Salir de la fila
        </Button>
      </div>
    );
  }

  if (phase === "ending") {
    return (
      <div className="pt-24 text-center">
        <Loader2Icon className="mx-auto size-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Cerrando la clase y preparando tu resumen…</p>
      </div>
    );
  }

  const lastTutor = [...call.captions].reverse().find((c) => c.role === "tutor");
  const lastStudent = [...call.captions].reverse().find((c) => c.role === "student");
  const low = remaining !== null && remaining <= 60;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#2b1f4d] to-[#120d22] shadow-2xl sm:aspect-video">
        {/* Tutor */}
        {call.tutorVideo ? (
          <video
            autoPlay
            playsInline
            className="h-full w-full object-cover"
            ref={(el) => {
              if (el && el.srcObject !== call.tutorVideo) el.srcObject = call.tutorVideo;
            }}
          />
        ) : (
          <div className="absolute inset-x-0 bottom-0 top-8 mx-auto w-[min(80%,420px)]">
            <TutorAvatar speaking={call.tutorSpeaking} />
          </div>
        )}
        {call.tutorAudio && (
          <audio
            autoPlay
            ref={(el) => {
              if (el && el.srcObject !== call.tutorAudio) el.srcObject = call.tutorAudio;
            }}
          />
        )}

        {/* Barra superior */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 text-sm font-medium text-white">
          <span className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur">
            <span className="size-2 rounded-full bg-red-500" />
            {call.status === "joined" ? "En clase" : "Conectando…"} · <Flag code={FLAG_BY_LANGUAGE[language]} />
            {session?.isTrial && <span className="ml-1 rounded bg-sun px-1.5 text-[11px] font-bold text-black">GRATIS</span>}
            {session?.driver === "fake" && <span className="ml-1 rounded bg-white/20 px-1.5 text-[11px]">SIMULADO</span>}
          </span>
          <span className={cn("rounded-full px-3 py-1.5 font-mono tabular-nums backdrop-blur", low ? "bg-coral text-white" : "bg-black/40")}>
            ⏱ {remaining === null ? "--:--" : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
          </span>
        </div>

        {/* Subtitulos */}
        <div className="absolute inset-x-4 bottom-28 space-y-2 sm:bottom-6 sm:right-56">
          {lastTutor && (
            <p className="w-fit max-w-full rounded-2xl rounded-bl-sm bg-white/95 px-4 py-2 text-sm font-medium text-[#22183d] shadow-lg">
              {lastTutor.text}
            </p>
          )}
          {lastStudent && (
            <p className="ml-auto w-fit max-w-full rounded-2xl rounded-br-sm bg-primary/90 px-4 py-2 text-sm text-primary-foreground shadow-lg">
              {lastStudent.text}
            </p>
          )}
        </div>

        {/* Mi camara */}
        <div className="absolute bottom-4 right-4 h-24 w-32 overflow-hidden rounded-2xl border-2 border-white/20 bg-black shadow-xl sm:h-32 sm:w-48">
          {call.localVideo && call.camOn ? (
            <video
              autoPlay
              muted
              playsInline
              className="h-full w-full -scale-x-100 object-cover"
              ref={(el) => {
                if (el && el.srcObject !== call.localVideo) el.srcObject = call.localVideo;
              }}
            />
          ) : (
            <div className="grid h-full place-items-center text-white/60">
              <CameraOffIcon />
            </div>
          )}
        </div>

        {call.status === "joining" && (
          <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
            <div className="text-center">
              <Loader2Icon className="mx-auto size-8 animate-spin" />
              <p className="mt-3 text-sm">Tu tutora se está conectando…</p>
            </div>
          </div>
        )}
      </div>

      {call.error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{call.error}</AlertDescription>
        </Alert>
      )}

      {/* Controles */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Button variant="outline" size="icon-lg" className="rounded-full" onClick={call.toggleMic} aria-label="Micrófono">
          {call.micOn ? <MicIcon /> : <MicOffIcon />}
        </Button>
        <Button variant="outline" size="icon-lg" className="rounded-full" onClick={call.toggleCam} aria-label="Cámara">
          {call.camOn ? <CameraIcon /> : <CameraOffIcon />}
        </Button>
        <Button variant="outline" size="icon-lg" className="hidden rounded-full sm:inline-flex" onClick={call.toggleScreenShare} aria-label="Compartir pantalla">
          <MonitorUpIcon />
        </Button>
        <Button variant="secondary" className="h-10 rounded-full" onClick={() => call.say(QUICK[base].slower)}>
          <SnailIcon /> Más despacio
        </Button>
        <Button variant="secondary" className="h-10 rounded-full" onClick={() => call.say(QUICK[base].repeat)}>
          <RepeatIcon /> Repite
        </Button>
        <Button
          className="h-10 rounded-full bg-destructive text-white hover:bg-destructive/90"
          onClick={() => void finish("USER_END")}
        >
          <PhoneOffIcon /> Terminar
        </Button>
      </div>
      <form
        className="mx-auto mt-4 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!howTo.trim()) return;
          call.say(QUICK[base].howTo(howTo.trim()));
          setHowTo("");
        }}
      >
        <Input value={howTo} onChange={(e) => setHowTo(e.target.value)} placeholder="¿Cómo se dice…? (escribe en español)" className="h-10 rounded-full" />
        <Button type="submit" variant="outline" className="h-10 rounded-full">
          <MessageSquareTextIcon /> Preguntar
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        ¿Problemas? <Link href="/app" className={cn(buttonVariants({ variant: "link" }), "h-auto p-0 text-xs")}>Volver al inicio</Link> (la clase se
        cierra sola si sales).
      </p>
    </div>
  );
}
