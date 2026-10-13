"use client";

import { CheckIcon, HighlighterIcon, Loader2Icon, SendIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { audioUrlAction, saveAnswerAction, submitPracticeAction, tabSwitchAction } from "@/app/app/examenes/actions";
import { Button } from "@/components/ui/button";
import { MODE_ES, TASK_TYPE_ES } from "@/lib/exams/labels";
import type { MapData } from "@/lib/render/svg";
import { cn } from "@/lib/utils";
import type { PracticeView } from "@/server/exams/practice";

import { ExamTimer } from "./exam-timer";
import { ListeningPlayer, type PlayerSegment } from "./listening-player";
import { QuestionGroups, questionDomId, type ExamGroup } from "./question-groups";

type SaveState = { kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string };


function sentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
}

export function ExamScreen({ view }: { view: PracticeView }) {
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>(view.answers);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [active, setActive] = useState(0);
  const [highlightMode, setHighlightMode] = useState(false);
  const [highlights, setHighlights] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [current, setCurrent] = useState<PlayerSegment | null>(null);
  const [submitting, startSubmit] = useTransition();
  const timers = useRef(new Map<string, { t: ReturnType<typeof setTimeout>; run: () => Promise<void> }>());
  const closed = view.status !== "IN_PROGRESS";

  const listening = view.section === "LISTENING";
  const segments: PlayerSegment[] = useMemo(
    () =>
      view.blocks.flatMap((b) =>
        b.audio
          .filter((a) => b.questionNumbers.some((n) => n >= a.questionsFrom && n <= a.questionsTo))
          // Goethe: algunas grabaciones suenan dos veces seguidas.
          .flatMap((a) =>
            Array.from({ length: b.plays ?? 1 }, () => ({ blockId: b.id, index: a.index, questionsFrom: a.questionsFrom, questionsTo: a.questionsTo, durationMs: a.durationMs })),
          ),
      ),
    [view.blocks],
  );

  const persist = useCallback(
    async (blockId: string, n: number, value: string) => {
      setSave({ kind: "saving" });
      const r = await saveAnswerAction(view.id, blockId, String(n), value);
      setSave(r.ok ? { kind: "saved" } : { kind: "error", message: r.error });
    },
    [view.id],
  );

  const onAnswer = useCallback(
    (blockId: string, n: number, value: string, opts?: { immediate?: boolean }) => {
      setAnswers((prev) => ({ ...prev, [blockId]: { ...prev[blockId], [String(n)]: value } }));
      const key = `${blockId}:${n}`;
      const pending = timers.current.get(key);
      if (pending) clearTimeout(pending.t);
      const run = async () => {
        timers.current.delete(key);
        await persist(blockId, n, value);
      };
      if (opts?.immediate) void run();
      else timers.current.set(key, { t: setTimeout(() => void run(), 700), run });
    },
    [persist],
  );

  const submit = useCallback(() => {
    startSubmit(async () => {
      // Guardar lo que estaba escribiendose antes de entregar.
      const pending = [...timers.current.values()];
      for (const p of pending) clearTimeout(p.t);
      await Promise.all(pending.map((p) => p.run()));
      await submitPracticeAction(view.id);
    });
  }, [view.id]);

  // Cambio de pestaña: queda registrado (como en el examen en computador).
  useEffect(() => {
    if (view.mode === "DRILL" || closed) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        void tabSwitchAction(view.id);
        setNotice("Saliste de la pestaña del examen. Queda registrado en tu resultado.");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [view.id, view.mode, closed]);

  const allQuestions = view.blocks.flatMap((b, bi) => b.questionNumbers.map((n) => ({ blockId: b.id, bi, n })));
  const answeredCount = allQuestions.filter((q) => (answers[q.blockId]?.[String(q.n)] ?? "").trim()).length;

  const goTo = (bi: number, blockId: string, n: number) => {
    if (!listening) setActive(bi);
    setTimeout(() => document.getElementById(questionDomId(blockId, n))?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const getUrl = useCallback((blockId: string, index: number) => audioUrlAction(view.id, blockId, index), [view.id]);

  const shown = listening ? view.blocks : [view.blocks[active]];

  return (
    <div className="pb-28">
      {/* Barra superior */}
      <div className="sticky top-16 z-30 -mx-4 mb-6 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {view.examName} · {view.mockId ? "Simulacro completo" : MODE_ES[view.mode]}
            </p>
            <p className="font-heading text-lg font-bold">
              {view.sectionName}
              {view.part ? ` · ${view.blocks[0]?.partTitle ?? view.part}` : ""}
              {view.taskType ? ` · ${TASK_TYPE_ES[view.taskType] ?? view.taskType}` : ""}
            </p>
          </div>
          <SaveBadge state={save} />
          {view.deadlineAt && !closed && <ExamTimer deadlineAt={view.deadlineAt} serverNow={view.serverNow} onExpire={submit} />}
          {confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {answeredCount}/{allQuestions.length} respondidas
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Seguir
              </Button>
              <Button type="button" size="sm" onClick={submit} disabled={submitting}>
                {submitting ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Entregar ahora
              </Button>
            </div>
          ) : (
            <Button type="button" size="sm" onClick={() => setConfirming(true)} disabled={submitting || closed}>
              Entregar
            </Button>
          )}
        </div>
        {notice && (
          <p className="mt-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
            <TriangleAlertIcon className="size-4" /> {notice}
          </p>
        )}
      </div>

      {listening && (
        <div className="mb-6">
          <ListeningPlayer
            segments={segments}
            readSeconds={view.listeningReadSeconds}
            free={view.mode === "DRILL"}
            disabled={submitting}
            getUrl={getUrl}
            onSegment={setCurrent}
          />
        </div>
      )}

      {!listening && view.blocks.length > 1 && (
        <div className="mb-4 flex gap-2">
          {view.blocks.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setActive(i)}
              className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", active === i ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70")}
            >
              {b.partTitle}
            </button>
          ))}
        </div>
      )}

      {shown.map((b) => {
        const content = b.content as unknown as {
          kind: string;
          groups: ExamGroup[];
          map?: MapData | null;
          passage?: { title: string; paragraphs: { label: string; text: string }[] };
        };
        const questions = (
          <QuestionGroups
            blockId={b.id}
            groups={content.groups}
            include={b.questionNumbers}
            language={view.exam === "IELTS_ACADEMIC" ? "en" : "de"}
            map={content.map}
            answers={answers[b.id] ?? {}}
            flagged={flagged}
            disabled={closed || submitting}
            onAnswer={(n, v, o) => onAnswer(b.id, n, v, o)}
            onFlag={(n) =>
              setFlagged((prev) => {
                const next = new Set(prev);
                const k = `${b.id}:${n}`;
                if (next.has(k)) next.delete(k);
                else next.add(k);
                return next;
              })
            }
          />
        );
        if (!content.passage)
          return (
            <section key={b.id} className="mb-10">
              {listening && view.blocks.length > 1 && <h2 className="mb-4 font-heading text-xl font-bold">{b.partTitle}</h2>}
              {questions}
            </section>
          );
        return (
          <section key={b.id} className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-2xl border bg-card lg:sticky lg:top-40 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto">
              <div className="sticky top-0 flex items-center justify-between gap-2 border-b bg-card/95 px-5 py-3 backdrop-blur">
                <h2 className="font-heading text-lg font-bold">{content.passage.title}</h2>
                <Button
                  type="button"
                  size="sm"
                  variant={highlightMode ? "default" : "outline"}
                  onClick={() => setHighlightMode((v) => !v)}
                  aria-pressed={highlightMode}
                  title="Resaltar frases del texto"
                >
                  <HighlighterIcon /> Resaltar
                </Button>
              </div>
              <div className="space-y-4 px-5 py-4 text-[15px] leading-relaxed">
                {content.passage.paragraphs.map((p) => (
                  <p key={p.label}>
                    <b className="mr-2 text-primary">{p.label}</b>
                    {sentences(p.text).map((s, si) => {
                      const id = `${b.id}:${p.label}:${si}`;
                      return (
                        <span
                          key={si}
                          onClick={
                            highlightMode
                              ? () =>
                                  setHighlights((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(id)) next.delete(id);
                                    else next.add(id);
                                    return next;
                                  })
                              : undefined
                          }
                          className={cn(highlights.has(id) && "rounded bg-yellow-200 dark:bg-yellow-700/60", highlightMode && "cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/40")}
                        >
                          {s}
                        </span>
                      );
                    })}
                  </p>
                ))}
              </div>
            </article>
            <div>{questions}</div>
          </section>
        );
      })}

      {/* Navegador de preguntas */}
      <nav aria-label="Preguntas" className="fixed inset-x-0 bottom-14 z-30 border-t bg-background/95 px-4 py-2 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1.5">
          {allQuestions.map((q) => {
            const done = (answers[q.blockId]?.[String(q.n)] ?? "").trim();
            const flag = flagged.has(`${q.blockId}:${q.n}`);
            const live = current && current.blockId === q.blockId && q.n >= current.questionsFrom && q.n <= current.questionsTo;
            return (
              <button
                key={`${q.blockId}-${q.n}`}
                type="button"
                onClick={() => goTo(q.bi, q.blockId, q.n)}
                className={cn(
                  "grid size-8 place-items-center rounded-md border text-xs font-semibold tabular-nums",
                  done ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                  flag && "ring-2 ring-amber-400",
                  live && !done && "border-primary",
                )}
              >
                {q.n}
              </button>
            );
          })}
          <span className="ml-auto text-xs text-muted-foreground">
            {answeredCount}/{allQuestions.length}
          </span>
        </div>
      </nav>
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "error")
    return (
      <span className="flex items-center gap-1 text-xs text-rose-600">
        <TriangleAlertIcon className="size-3.5" /> {state.message}
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      {state.kind === "saving" ? <Loader2Icon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
      {state.kind === "saving" ? "Guardando…" : "Guardado"}
    </span>
  );
}
