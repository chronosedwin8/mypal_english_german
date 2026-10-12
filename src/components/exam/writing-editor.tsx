"use client";

import { CheckIcon, Loader2Icon, SendIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { saveWritingDraftAction, submitWritingAction } from "@/app/app/examenes/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ExamTimer } from "./exam-timer";

function countWords(s: string) {
  let n = 0;
  let prevNumber = false;
  for (const w of s.trim().split(/\s+/)) {
    if (!/[\p{L}\p{N}]/u.test(w)) continue;
    const isNumber = /^[\d.,:/]+$/.test(w);
    if (!(isNumber && prevNumber)) n++;
    prevNumber = isNumber;
  }
  return n;
}

/**
 * Editor de Writing como en el examen en computador: sin corrector ortografico,
 * contador de palabras, guardado automatico y entrega automatica al vencer el tiempo.
 */
export function WritingEditor(props: {
  attemptId: string;
  initial: string;
  minWords: number;
  deadlineAt: string | null;
  serverNow: string;
}) {
  const [text, setText] = useState(props.initial);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);
  const words = countWords(text);

  useEffect(() => {
    latest.current = text;
  }, [text]);

  const persist = useCallback(
    async (value: string) => {
      setSaved("saving");
      const r = await saveWritingDraftAction(props.attemptId, value);
      if (r.ok) {
        setSaved("saved");
        setError(null);
      } else setError(r.error);
    },
    [props.attemptId],
  );

  const onChange = (value: string) => {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(value), 1500);
  };

  const submit = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    start(async () => {
      const r = await submitWritingAction(props.attemptId, latest.current);
      if (r && !r.ok) setError(r.error);
    });
  }, [props.attemptId]);

  return (
    <div className="flex h-full flex-col rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <span className={cn("text-sm font-semibold tabular-nums", words < props.minWords ? "text-amber-600" : "text-emerald-600")}>
          {words} palabras
          <span className="font-normal text-muted-foreground"> · mínimo {props.minWords}</span>
        </span>
        {saved !== "idle" && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {saved === "saving" ? <Loader2Icon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
            {saved === "saving" ? "Guardando…" : "Guardado"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {props.deadlineAt && <ExamTimer deadlineAt={props.deadlineAt} serverNow={props.serverNow} onExpire={submit} />}
          {confirming ? (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Seguir escribiendo
              </Button>
              <Button type="button" size="sm" onClick={submit} disabled={pending}>
                {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Entregar para calificar
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={() => setConfirming(true)} disabled={pending}>
              Entregar
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p className="flex items-center gap-2 border-b bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">
          <TriangleAlertIcon className="size-4" /> {error}
        </p>
      )}
      {confirming && words < props.minWords && (
        <p className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Tu texto tiene menos de {props.minWords} palabras: en el examen eso baja la nota.
        </p>
      )}
      <textarea
        aria-label="Tu respuesta"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        placeholder="Escribe tu respuesta en inglés…"
        className="min-h-[50vh] flex-1 resize-none rounded-b-2xl bg-transparent p-5 font-[inherit] text-[15px] leading-7 focus:outline-none"
      />
    </div>
  );
}
