import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/app/auto-refresh";
import { SpeakingRoom } from "@/components/exam/speaking-room";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ieltsToCefr } from "@/content/exams/scales";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/dal";
import { SpeakingError, loadSpeakingResult, speakingState } from "@/server/exams/speaking";

export const metadata = { title: "Speaking" };

const CRITERIA_ES: Record<string, string> = {
  FC: "Fluidez y coherencia",
  LR: "Vocabulario",
  GRA: "Gramática",
  P: "Pronunciación",
};

export default function SpeakingPage(props: PageProps<"/app/examenes/speaking/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
      <Speaking params={props.params} />
    </Suspense>
  );
}

async function Speaking({ params }: { params: PageProps<"/app/examenes/speaking/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser(`/app/examenes/speaking/${id}`);
  let state;
  try {
    state = await speakingState(id, user.id);
  } catch (err) {
    if (err instanceof SpeakingError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const mockId = state.mockId;
  if (mockId && state.status !== "IN_PROGRESS") redirect(`/app/examenes/simulacro/${mockId}`);
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div>
        <Link href={mockId ? `/app/examenes/simulacro/${mockId}` : `/app/examenes?examen=${state.exam}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Exámenes
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-extrabold tracking-tight">Speaking</h1>
      </div>
      {state.status === "IN_PROGRESS" ? <SpeakingRoom initial={state} /> : <Result attemptId={id} userId={user.id} />}
    </div>
  );
}

async function Result({ attemptId, userId }: { attemptId: string; userId: string }) {
  const { attempt, parts } = await loadSpeakingResult(attemptId, userId);
  const scoring = attempt.status === "SCORING";
  const scores = attempt.scores as { band: number; criteria: Record<string, number>; scale?: { label: string; pass?: boolean; value: number } | null } | null;
  const labels = parts.find((p) => p.feedback?.criteriaLabels)?.feedback?.criteriaLabels ?? CRITERIA_ES;
  const german = attempt.exam !== "IELTS_ACADEMIC";
  return (
    <div className="space-y-6">
      {scoring && (
        <div className="rounded-3xl border bg-card p-8 text-center">
          <AutoRefresh everyMs={5000} />
          <Loader2Icon className="mx-auto size-8 animate-spin text-primary" />
          <p className="mt-4 font-heading text-xl font-bold">Calificando tu Speaking…</p>
          <p className="mt-1 text-muted-foreground">Escuchamos tus respuestas y revisamos la transcripción. Suele tardar uno o dos minutos.</p>
        </div>
      )}
      {attempt.status === "VOIDED" && (
        <div className="rounded-3xl border border-rose-300 bg-rose-50 p-6 dark:border-rose-900 dark:bg-rose-950">
          No pudimos calificar esta sesión por un problema nuestro. Tus partes de Speaking se devolvieron a tu plan.
        </div>
      )}
      {scores && attempt.status === "COMPLETED" && (
        <section className="grid gap-4 md:grid-cols-[1fr_2fr]">
          <div className="rounded-3xl border bg-card p-6">
            <p className="text-sm text-muted-foreground">{german ? "Nota estimada de Sprechen" : "Banda estimada de Speaking"}</p>
            <p className="mt-1 font-heading text-6xl font-extrabold tabular-nums">{german && scores.scale ? scores.scale.value : scores.band.toFixed(1)}</p>
            {scores.scale?.pass !== undefined && (
              <p className={cn("mt-1 inline-block rounded-full px-3 py-0.5 text-sm font-bold", scores.scale.pass ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200")}>
                {scores.scale.pass ? "Aprobado" : "No aprobado"}
              </p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">{german && scores.scale ? scores.scale.label : `MCER ${ieltsToCefr(scores.band)}`} · estimación, no oficial</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(labels).map(([c, label]) => (
              <div key={c} className="flex items-baseline justify-between rounded-2xl border bg-card p-4">
                <p className="text-sm font-semibold">{label}</p>
                <p className="font-heading text-2xl font-extrabold tabular-nums">
                  {(scores.criteria[c] ?? 0).toFixed(1)}
                  {german && <span className="text-sm font-normal text-muted-foreground">/5</span>}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {parts.map((p) => (
        <section key={p.part} className="space-y-4 rounded-3xl border bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-bold">{p.title}</h2>
            {p.band !== null && (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">{p.feedback?.scale ? p.feedback.scale.label : `banda ${p.band.toFixed(1)}`}</span>
            )}
          </div>
          {p.feedback && (
            <>
              <p className="text-muted-foreground">{p.feedback.overviewEs}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(p.feedback.criteriaLabels ?? CRITERIA_ES).map(([c, label]) => {
                  const v = p.feedback!.criteria[c];
                  return (
                    <div key={c} className="rounded-2xl bg-muted/40 p-3 text-sm">
                      <p className="font-semibold">
                        {label}: {v.band}
                      </p>
                      <p className="text-muted-foreground">{v.commentEs}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {p.feedback.metrics.wordsPerMinute} palabras por minuto · {p.feedback.metrics.longPausesPerMinute} pausas largas por minuto ·{" "}
                {p.feedback.metrics.averageAnswerSeconds} s por respuesta
              </p>
              {p.feedback.improvements.length > 0 && (
                <div>
                  <p className="font-semibold">Dilo mejor</p>
                  <ul className="mt-2 space-y-2 text-sm">
                    {p.feedback.improvements.map((i, k) => (
                      <li key={k} className="rounded-xl border p-3">
                        <p>
                          <s className="text-rose-600">{i.said}</s> → <b className="text-emerald-700 dark:text-emerald-300">{i.better}</b>
                        </p>
                        <p className="text-muted-foreground">{i.explanationEs}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-semibold">Transcripción y grabaciones</summary>
            <ol className="mt-3 space-y-2 text-sm">
              {p.turns.map((t, i) => (
                <li key={i} className={cn("rounded-xl px-3 py-2", t.who === "examiner" ? "bg-muted/60" : "bg-primary/10")}>
                  <span className="text-xs font-semibold text-muted-foreground">{t.who === "examiner" ? "Examinador" : "Tú"}</span>
                  <p>{t.text || "(sin respuesta)"}</p>
                  {t.url && <audio controls preload="none" src={t.url} className="mt-2 h-8 w-full" />}
                </li>
              ))}
            </ol>
          </details>
        </section>
      ))}
      <Link href="/app/examenes" className={buttonVariants({ variant: "outline" })}>
        Volver a exámenes
      </Link>
    </div>
  );
}
