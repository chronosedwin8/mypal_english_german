import { CheckCircle2Icon, RotateCcwIcon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EXAMS } from "@/content/exams";
import { ieltsToCefr } from "@/content/exams/scales";
import { MODE_ES, SECTION_ES, TASK_TYPE_ES } from "@/lib/exams/labels";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/dal";
import { PracticeError, loadPracticeResult } from "@/server/exams/practice";

import { startPracticeAction } from "../../actions";

export const metadata = { title: "Resultado de la práctica" };

export default function ResultPage(props: PageProps<"/app/examenes/resultado/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
      <Result params={props.params} />
    </Suspense>
  );
}

async function Result({ params }: { params: PageProps<"/app/examenes/resultado/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser(`/app/examenes/resultado/${id}`);
  let data;
  try {
    data = await loadPracticeResult(id, user.id);
  } catch (err) {
    if (err instanceof PracticeError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  if (!data) redirect(`/app/examenes/practica/${id}`);
  const { attempt, config, scores, blocks } = data;
  // Secciones de un simulacro: las respuestas se ven en el informe final.
  if (config.mockId) redirect(`/app/examenes/simulacro/${config.mockId}`);
  const pct = scores.total ? Math.round((scores.correct / scores.total) * 100) : 0;
  const spec = EXAMS[attempt.exam];

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      <div>
        <Link href={`/app/examenes?examen=${attempt.exam}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Exámenes
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-extrabold tracking-tight">Tu resultado</h1>
        <p className="mt-1 text-muted-foreground">
          {spec.name} · {SECTION_ES[config.section]} · {MODE_ES[attempt.mode]}
          {config.part ? ` · parte ${config.part}` : ""}
          {config.taskType ? ` · ${TASK_TYPE_ES[config.taskType] ?? config.taskType}` : ""}
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <div className="rounded-3xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">Aciertos</p>
          <p className="mt-1 font-heading text-5xl font-extrabold tabular-nums">
            {scores.correct}
            <span className="text-2xl text-muted-foreground">/{scores.total}</span>
          </p>
          <Progress value={pct} className="mt-4 h-2" />
          {scores.band !== null && (
            <p className="mt-4 text-sm">
              Banda {scores.bandIsEstimate ? "estimada" : ""} <b className="text-lg">{scores.band.toFixed(1)}</b> · MCER {ieltsToCefr(scores.band)}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {scores.bandIsEstimate
              ? "Con pocas preguntas la banda es solo orientativa; la sección completa da una estimación más fiel."
              : "Nota estimada, no oficial: la tabla de conversión se ajusta a medida que más personas responden esta forma."}
          </p>
        </div>
        <div className="rounded-3xl border bg-card p-6">
          <p className="font-semibold">Por tipo de pregunta</p>
          <ul className="mt-3 space-y-3">
            {Object.entries(scores.byTaskType).map(([t, v]) => (
              <li key={t}>
                <div className="flex justify-between text-sm">
                  <span>{TASK_TYPE_ES[t] ?? t}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {v.correct}/{v.total}
                  </span>
                </div>
                <Progress value={(v.correct / Math.max(v.total, 1)) * 100} className="mt-1 h-1.5" />
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <form action={startPracticeAction}>
              <input type="hidden" name="exam" value={attempt.exam} />
              <input type="hidden" name="mode" value={attempt.mode} />
              <input type="hidden" name="section" value={config.section} />
              {config.part && <input type="hidden" name="part" value={config.part} />}
              {config.taskType && <input type="hidden" name="taskType" value={config.taskType} />}
              <Button type="submit">
                <RotateCcwIcon /> Practicar otra vez
              </Button>
            </form>
            <Link href={`/app/examenes?examen=${attempt.exam}`} className={buttonVariants({ variant: "outline" })}>
              Elegir otra práctica
            </Link>
          </div>
        </div>
      </section>

      {blocks.map((b) => (
        <section key={b.id} className="space-y-4">
          <h2 className="font-heading text-xl font-bold">
            {config.section === "LISTENING" ? "Part" : "Passage"} {b.part} · <span className="font-normal text-muted-foreground">{b.topic}</span>
          </h2>

          {b.content.passage && (
            <details className="rounded-2xl border bg-card p-4">
              <summary className="cursor-pointer font-semibold">Ver el texto: {b.content.passage.title}</summary>
              <div className="mt-3 space-y-3 text-sm leading-relaxed">
                {b.content.passage.paragraphs.map((p) => (
                  <p key={p.label}>
                    <b className="mr-2 text-primary">{p.label}</b>
                    {p.text}
                  </p>
                ))}
              </div>
            </details>
          )}
          {b.key.segments && (
            <details className="rounded-2xl border bg-card p-4">
              <summary className="cursor-pointer font-semibold">Ver la transcripción del audio</summary>
              <div className="mt-3 space-y-1.5 text-sm leading-relaxed">
                {b.key.segments.flatMap((s, si) =>
                  s.lines.map((l, li) => (
                    <p key={`${si}-${li}`}>
                      <b className="mr-1">{l.speaker === "NARRATOR" ? "Narrador" : (b.key.speakers?.find((x) => x.id === l.speaker)?.name ?? l.speaker)}:</b>
                      {l.text}
                    </p>
                  )),
                )}
              </div>
            </details>
          )}

          <ol className="space-y-3">
            {b.content.groups
              .flatMap((g) => g.questions.map((q) => ({ q, g })))
              .filter(({ q }) => b.questionNumbers.includes(q.number))
              .map(({ q, g }) => {
                const key = b.key.questions[String(q.number)];
                const r = b.responses[String(q.number)];
                const ok = r?.isCorrect === true;
                const label = (v: string) => {
                  const o = (q.options ?? g.sharedOptions ?? []).find((x) => x.key === v);
                  return o && !/^option\s+\w{1,2}$/i.test(o.text) ? `${v} — ${o.text}` : v;
                };
                return (
                  <li key={q.number} className={cn("rounded-2xl border bg-card p-4 text-sm", ok ? "border-emerald-300 dark:border-emerald-800" : "border-rose-300 dark:border-rose-900")}>
                    <div className="flex items-start gap-3">
                      {ok ? <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <XCircleIcon className="mt-0.5 size-5 shrink-0 text-rose-600" />}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p>
                          <b className="mr-2">{q.number}.</b>
                          {q.prompt}
                        </p>
                        <p>
                          Tu respuesta: <b className={ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}>{r?.value ? label(r.value) : "sin responder"}</b>
                          {!ok && (
                            <>
                              {" "}
                              · Correcta: <b>{label(key.answers[0])}</b>
                              {key.answers.length > 1 && <span className="text-muted-foreground"> (también: {key.answers.slice(1).join(", ")})</span>}
                            </>
                          )}
                        </p>
                        <p className="text-muted-foreground">{key.explanationEs}</p>
                        {key.answers[0] !== "NOT GIVEN" && (
                          <p className="rounded-lg bg-muted/50 px-3 py-2 italic">“{key.evidence}”</p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
          </ol>
        </section>
      ))}
    </div>
  );
}
