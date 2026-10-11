"use client";

import { ArrowRightIcon, Loader2Icon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Turnstile } from "@/components/auth/turnstile";
import { Flag, FLAG_BY_LANGUAGE } from "@/components/flag";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LANGUAGES, LANGUAGE_CODES, type LanguageCode } from "@/lib/site";
import { cn } from "@/lib/utils";

import { ApiError, diagnosticApi, type DiagnosticState } from "./api";
import { ItemView } from "./item-view";
import { SpeakingView } from "./speaking-view";

const STORAGE_KEY = "mypal:diagnostic";

function remember(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

export function DiagnosticRunner() {
  const router = useRouter();
  const [language, setLanguage] = useState<LanguageCode>("EN_US");
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<DiagnosticState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const onToken = useCallback((t: string | null) => setToken(t), []);

  // ¿Hay un test a medias en este navegador?
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      saved = null;
    }
    if (!saved) return;
    diagnosticApi
      .state(saved)
      .then((s) => (s.phase === "DONE" ? remember(null) : setResumeId(saved)))
      .catch(() => remember(null));
  }, []);

  const apply = useCallback(
    (next: DiagnosticState) => {
      if (next.phase === "DONE") {
        remember(null);
        router.push(`/test-de-nivel/resultado/${next.attemptId}`);
        return;
      }
      remember(next.attemptId);
      setState(next);
    },
    [router],
  );

  const run = useCallback(
    async (fn: () => Promise<DiagnosticState>) => {
      setError(null);
      setPending(true);
      try {
        apply(await fn());
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "No pudimos conectar. Revisa tu internet e inténtalo de nuevo.");
        if (e instanceof ApiError && e.code === "STALE_ITEM" && state) {
          diagnosticApi.state(state.attemptId).then(apply).catch(() => undefined);
        }
      } finally {
        setPending(false);
      }
    },
    [apply, state],
  );

  if (!state) {
    return (
      <div className="pt-6">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">Test de nivel gratis</h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Unos 8 minutos. Preguntas que se adaptan a ti, audios con voces nativas y dos ejercicios cortos para hablar.
          Sin registro.
        </p>

        {resumeId && (
          <Alert className="mt-6">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              Tienes un test sin terminar.
              <Button size="sm" onClick={() => run(() => diagnosticApi.state(resumeId))} disabled={pending}>
                Continuar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <h2 className="mt-8 font-semibold">¿Qué quieres aprender?</h2>
        <div role="radiogroup" aria-label="Idioma" className="mt-3 grid gap-3 sm:grid-cols-3">
          {LANGUAGE_CODES.map((code) => {
            const lang = LANGUAGES[code];
            const active = language === code;
            return (
              <button
                key={code}
                role="radio"
                aria-checked={active}
                onClick={() => setLanguage(code)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border-2 bg-card p-4 text-left transition-colors",
                  active ? "border-primary ring-4 ring-primary/15" : "border-border hover:border-primary/40",
                )}
              >
                <Flag code={FLAG_BY_LANGUAGE[code]} className="h-7" />
                <span className="font-semibold">{lang.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <Turnstile onToken={onToken} action="diagnostic" />
        </div>
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button
          className="mt-6 h-12 w-full rounded-full text-base sm:w-auto sm:px-8"
          disabled={!token || pending}
          onClick={() => run(() => diagnosticApi.start(language, token!))}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : null} Empezar el test <ArrowRightIcon />
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          Para la parte oral te pediremos permiso para usar el micrófono. Puedes saltarla.
        </p>
      </div>
    );
  }

  return (
    <div className="pt-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={state.phase === "ITEMS" ? state.item.id : state.phase === "SPEAKING" ? state.task.id : "x"}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
        >
          {state.phase === "ITEMS" && (
            <ItemView
              state={state}
              pending={pending}
              locale={LANGUAGES[language].locale}
              onAnswer={(itemId, index, latency) => run(() => diagnosticApi.answer(state.attemptId, itemId, index, latency))}
            />
          )}
          {state.phase === "SPEAKING" && (
            <SpeakingView
              state={state}
              pending={pending}
              onSubmit={(blob, ms) => run(() => diagnosticApi.speaking(state.attemptId, state.task.id, blob, ms))}
              onSkip={() => run(() => diagnosticApi.skipSpeaking(state.attemptId))}
            />
          )}
        </motion.div>
      </AnimatePresence>
      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
