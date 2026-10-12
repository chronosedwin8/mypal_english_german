import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/app/auto-refresh";
import { WritingEditor } from "@/components/exam/writing-editor";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ieltsToCefr } from "@/content/exams/scales";
import { renderChartSvg, type ChartData } from "@/lib/render/svg";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/dal";
import { WritingError, loadWriting, type WritingFeedback } from "@/server/exams/writing";

export const metadata = { title: "Writing" };

const CRITERIA_ES: Record<string, string> = {
  TA: "Cumplimiento de la tarea",
  CC: "Coherencia y cohesión",
  LR: "Vocabulario",
  GRA: "Gramática",
};

export default function WritingPage(props: PageProps<"/app/examenes/writing/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[70vh] w-full rounded-3xl" />}>
      <Writing params={props.params} />
    </Suspense>
  );
}

async function Writing({ params }: { params: PageProps<"/app/examenes/writing/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser(`/app/examenes/writing/${id}`);
  let data;
  try {
    data = await loadWriting(id, user.id);
  } catch (err) {
    if (err instanceof WritingError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const { attempt, config, task, submission } = data;
  const prompt = (
    <div className="space-y-4 rounded-2xl border bg-card p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Writing Task {config.part} · {data.minutes} minutos sugeridos
      </p>
      <p className="whitespace-pre-line text-[15px] leading-relaxed">{task.prompt}</p>
      {task.chart ? (
        <div
          className="overflow-hidden rounded-xl border [&_svg]:h-auto [&_svg]:w-full"
          // SVG dibujado por nuestro codigo con texto escapado.
          dangerouslySetInnerHTML={{ __html: renderChartSvg(task.chart as ChartData) }}
        />
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div>
        <Link href={`/app/examenes?examen=${attempt.exam}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Exámenes
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-extrabold tracking-tight">Writing · Task {config.part}</h1>
      </div>

      {!submission && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="lg:sticky lg:top-24 lg:self-start">{prompt}</div>
          <WritingEditor attemptId={attempt.id} initial={data.draft} minWords={data.minWords} deadlineAt={data.deadlineAt} serverNow={data.serverNow} />
        </div>
      )}

      {submission?.status === "PENDING" && (
        <div className="rounded-3xl border bg-card p-8 text-center">
          <AutoRefresh everyMs={5000} />
          <Loader2Icon className="mx-auto size-8 animate-spin text-primary" />
          <p className="mt-4 font-heading text-xl font-bold">Calificando tu texto…</p>
          <p className="mt-1 text-muted-foreground">Dos examinadores virtuales lo leen por separado. Suele tardar uno o dos minutos.</p>
        </div>
      )}

      {submission?.status === "FAILED" && (
        <div className="rounded-3xl border border-rose-300 bg-rose-50 p-6 dark:border-rose-900 dark:bg-rose-950">
          <p className="font-semibold">No pudimos calificar tu texto.</p>
          <p className="mt-1 text-sm">Fue un problema de nuestro lado: tu corrección se devolvió a tu plan. Puedes intentarlo de nuevo.</p>
        </div>
      )}

      {submission?.status === "GRADED" && submission.feedback && submission.band !== null && (
        <Feedback band={submission.band} feedback={submission.feedback} text={submission.text} words={submission.words} minWords={data.minWords} prompt={prompt} />
      )}
    </div>
  );
}

/** Marca en el texto los fragmentos con error. */
function marked(text: string, errors: WritingFeedback["errors"]) {
  const spans: { start: number; end: number; i: number }[] = [];
  errors.forEach((e, i) => {
    const start = text.indexOf(e.quote);
    if (start >= 0 && !spans.some((s) => start < s.end && start + e.quote.length > s.start)) spans.push({ start, end: start + e.quote.length, i });
  });
  spans.sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const s of spans) {
    out.push(text.slice(at, s.start));
    out.push(
      <mark key={s.start} className="rounded bg-rose-100 px-0.5 text-inherit underline decoration-rose-500 decoration-wavy dark:bg-rose-950" title={errors[s.i].correction}>
        {text.slice(s.start, s.end)}
        <sup className="ml-0.5 text-[10px] font-bold text-rose-600">{s.i + 1}</sup>
      </mark>,
    );
    at = s.end;
  }
  out.push(text.slice(at));
  return out;
}

function Feedback(props: { band: number; feedback: WritingFeedback; text: string; words: number; minWords: number; prompt: React.ReactNode }) {
  const f = props.feedback;
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <div className="rounded-3xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">Banda estimada</p>
          <p className="mt-1 font-heading text-6xl font-extrabold tabular-nums">{props.band.toFixed(1)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            MCER {ieltsToCefr(props.band)} · {props.words} palabras
            {props.words < props.minWords && <span className="text-amber-600"> (menos de {props.minWords})</span>}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">Estimación de {f.graders} calificaciones independientes. No es una nota oficial.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(CRITERIA_ES) as (keyof WritingFeedback["criteria"])[]).map((c) => (
            <div key={c} className="rounded-2xl border bg-card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">{CRITERIA_ES[c]}</p>
                <p className="font-heading text-2xl font-extrabold tabular-nums">{f.criteria[c].band}</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{f.criteria[c].commentEs}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-6">
        <p className="font-semibold">Qué mejorar primero</p>
        <p className="mt-1 text-muted-foreground">{f.overviewEs}</p>
        {f.nextStepsEs.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {f.nextStepsEs.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border bg-card p-6">
          <p className="mb-3 font-semibold">Tu texto</p>
          <p className="whitespace-pre-line text-[15px] leading-7">{marked(props.text, f.errors)}</p>
        </div>
        <div className="rounded-3xl border bg-card p-6">
          <p className="mb-3 font-semibold">Errores marcados</p>
          {f.errors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No encontramos errores puntuales.</p>
          ) : (
            <ol className="space-y-3 text-sm">
              {f.errors.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-rose-100 text-xs font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-200">
                    {i + 1}
                  </span>
                  <div>
                    <p>
                      <s className="text-rose-600">{e.quote}</s> → <b className="text-emerald-700 dark:text-emerald-300">{e.correction}</b>
                    </p>
                    <p className="text-muted-foreground">{e.explanationEs}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <details className="rounded-3xl border bg-card p-6" open>
        <summary className="cursor-pointer font-semibold">Tu texto, una banda más arriba</summary>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-7">{f.improvedVersion}</p>
      </details>
      <details className="rounded-3xl border bg-card p-6">
        <summary className="cursor-pointer font-semibold">Respuesta modelo (banda 8–9) y enunciado</summary>
        <div className="mt-4">{props.prompt}</div>
        <p className="mt-4 whitespace-pre-line text-[15px] leading-7">{f.modelAnswer}</p>
      </details>
      <Link href="/app/examenes" className={cn(buttonVariants({ variant: "outline" }))}>
        Volver a exámenes
      </Link>
    </div>
  );
}
