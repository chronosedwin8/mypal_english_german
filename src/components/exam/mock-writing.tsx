"use client";

import { Loader2Icon, SendIcon } from "lucide-react";
import { useCallback, useRef, useState, useTransition } from "react";

import { saveWritingDraftAction, submitMockWritingAction } from "@/app/app/examenes/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ExamTimer } from "./exam-timer";

function countWords(s: string) {
  return s.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

interface Task {
  attemptId: string;
  task: number;
  minWords: number;
  promptHtml: string;
  draft: string;
}

/** Writing del simulacro: las dos tareas con un solo reloj de 60 minutos, como en el examen. */
export function MockWriting(props: { mockId: string; tasks: Task[]; deadlineAt: string; serverNow: string }) {
  const [active, setActive] = useState(0);
  const [texts, setTexts] = useState<Record<string, string>>(Object.fromEntries(props.tasks.map((t) => [t.attemptId, t.draft])));
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef(texts);

  const onChange = (id: string, value: string) => {
    setTexts((prev) => {
      const next = { ...prev, [id]: value };
      latest.current = next;
      return next;
    });
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.set(
      id,
      setTimeout(() => {
        void saveWritingDraftAction(id, value).then((r) => setError(r.ok ? null : r.error));
      }, 1500),
    );
  };

  const submit = useCallback(() => {
    for (const t of timers.current.values()) clearTimeout(t);
    start(async () => {
      const r = await submitMockWritingAction(props.mockId, latest.current);
      if (r && !r.ok) setError(r.error);
    });
  }, [props.mockId]);

  const task = props.tasks[active];
  return (
    <div className="space-y-4">
      <div className="sticky top-16 z-30 -mx-4 flex flex-wrap items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex gap-2">
          {props.tasks.map((t, i) => (
            <button
              key={t.attemptId}
              type="button"
              onClick={() => setActive(i)}
              className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", active === i ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70")}
            >
              Task {t.task} · {countWords(texts[t.attemptId] ?? "")} palabras
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ExamTimer deadlineAt={props.deadlineAt} serverNow={props.serverNow} onExpire={submit} />
          {confirming ? (
            <Button type="button" size="sm" onClick={submit} disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Entregar las dos tareas
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => setConfirming(true)} disabled={pending}>
              Entregar Writing
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div
          className="space-y-4 rounded-2xl border bg-card p-5 text-[15px] leading-relaxed lg:sticky lg:top-36 lg:self-start [&_svg]:h-auto [&_svg]:w-full"
          // Enunciado y grafico dibujados en el servidor con texto escapado.
          dangerouslySetInnerHTML={{ __html: task.promptHtml }}
        />
        <div className="rounded-2xl border bg-card">
          <p className={cn("border-b px-4 py-2 text-sm", countWords(texts[task.attemptId] ?? "") < task.minWords ? "text-amber-600" : "text-emerald-600")}>
            {countWords(texts[task.attemptId] ?? "")} palabras · mínimo {task.minWords}
          </p>
          <textarea
            key={task.attemptId}
            aria-label={`Respuesta de la Task ${task.task}`}
            value={texts[task.attemptId] ?? ""}
            onChange={(e) => onChange(task.attemptId, e.target.value)}
            disabled={pending}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className="min-h-[55vh] w-full resize-none rounded-b-2xl bg-transparent p-5 text-[15px] leading-7 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
