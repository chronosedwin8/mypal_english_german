import { BookOpenTextIcon, CheckCircle2Icon, HeadphonesIcon, Loader2Icon, LockIcon, MicIcon, PenLineIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/app/auto-refresh";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EXAMS } from "@/content/exams";
import { TASK_TYPE_ES } from "@/lib/exams/labels";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/dal";
import { MockError, mockView, type MockStage } from "@/server/exams/mock";

import { skipMockSpeakingAction, startMockStageAction } from "../../actions";

export const metadata = { title: "Simulacro completo" };

const ICONS: Record<MockStage, typeof HeadphonesIcon> = { LISTENING: HeadphonesIcon, READING: BookOpenTextIcon, WRITING: PenLineIcon, SPEAKING: MicIcon };
const RULES: Record<MockStage, string> = {
  LISTENING: "Cuatro grabaciones que suenan una sola vez, con tiempo para leer antes de cada una. Al final tienes 2 minutos para revisar.",
  READING: "Tres textos y 40 preguntas en 60 minutos. Puedes moverte entre los textos; al entregar no se puede volver.",
  WRITING: "Task 1 (gráfico, 150 palabras) y Task 2 (ensayo, 250 palabras) en 60 minutos con un solo reloj.",
  SPEAKING: "Entrevista con el examinador por voz: tres partes, unos 14 minutos. Puedes hacerlo ahora o más tarde.",
};

export default function MockPage(props: PageProps<"/app/examenes/simulacro/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
      <Mock params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Mock({ params, searchParams }: { params: PageProps<"/app/examenes/simulacro/[id]">["params"]; searchParams: PageProps<"/app/examenes/simulacro/[id]">["searchParams"] }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/app/examenes/simulacro/${id}`);
  let view;
  try {
    view = await mockView(id, user.id);
  } catch (err) {
    if (err instanceof MockError) notFound();
    throw err;
  }
  const { mock, stages, report, scores } = view;
  const spec = EXAMS[mock.exam];
  const next = stages.find((s) => s.status === "ACTIVE" || s.status === "PENDING");
  const aviso = typeof sp.aviso === "string" ? sp.aviso : null;

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      <div>
        <Link href={`/app/examenes?examen=${mock.exam}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Exámenes
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-extrabold tracking-tight">Simulacro completo · {spec.name}</h1>
        <p className="mt-1 text-muted-foreground">Forma {view.config.formVersion} · condiciones reales: tiempo del servidor, audio una sola vez y sin volver atrás.</p>
      </div>

      {aviso && <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{aviso}</p>}

      <ol className="grid gap-3 md:grid-cols-4">
        {stages.map((s) => {
          const Icon = ICONS[s.stage];
          const done = s.status === "DONE" || s.status === "SKIPPED";
          return (
            <li
              key={s.stage}
              className={cn(
                "rounded-3xl border bg-card p-4",
                next?.stage === s.stage && mock.status === "IN_PROGRESS" && "border-primary ring-2 ring-primary/20",
                done && "opacity-80",
              )}
            >
              <div className="flex items-center gap-2">
                {done ? <CheckCircle2Icon className="size-5 text-emerald-600" /> : s.status === "ACTIVE" ? <Icon className="size-5 text-primary" /> : <LockIcon className="size-4 text-muted-foreground" />}
                <p className="font-semibold">{s.name}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.status === "SKIPPED" ? "Omitido" : done ? "Entregado" : s.status === "ACTIVE" ? "En curso" : `${s.minutes} min`}
              </p>
            </li>
          );
        })}
      </ol>

      {mock.status === "IN_PROGRESS" && next && (
        <section className="rounded-3xl border bg-card p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Siguiente sección</p>
          <h2 className="mt-1 font-heading text-2xl font-extrabold">{next.name}</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {mock.exam === "IELTS_ACADEMIC"
              ? RULES[next.stage]
              : `${spec.sections.find((x) => x.section === next.stage)!.parts.length} partes en ${next.minutes} minutos.${next.stage === "LISTENING" ? " Cada audio suena las veces que fija el examen." : ""}${next.stage === "SPEAKING" ? " Puedes hacerlo ahora o más tarde." : ""}`}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {next.status === "ACTIVE" && next.url ? (
              <Link href={next.url} className={buttonVariants()}>
                Continuar {next.name}
              </Link>
            ) : (
              <form action={startMockStageAction}>
                <input type="hidden" name="mockId" value={mock.id} />
                <input type="hidden" name="stage" value={next.stage} />
                <Button type="submit">Empezar {next.name}</Button>
              </form>
            )}
            {next.stage === "SPEAKING" && next.status === "PENDING" && (
              <form action={skipMockSpeakingAction}>
                <input type="hidden" name="mockId" value={mock.id} />
                <Button type="submit" variant="ghost">
                  Terminar sin Speaking
                </Button>
              </form>
            )}
          </div>
          {next.stage === "SPEAKING" && (
            <p className="mt-3 text-xs text-muted-foreground">Puedes salir y volver más tarde: el simulacro te espera aquí.</p>
          )}
        </section>
      )}

      {mock.status === "SCORING" && (
        <section className="rounded-3xl border bg-card p-8 text-center">
          <AutoRefresh everyMs={8000} />
          <Loader2Icon className="mx-auto size-8 animate-spin text-primary" />
          <p className="mt-4 font-heading text-xl font-bold">Calificando Writing y Speaking…</p>
          <p className="mt-1 text-muted-foreground">Te avisamos por correo cuando tu informe esté listo. Suele tardar unos minutos.</p>
        </section>
      )}

      {mock.status === "COMPLETED" && scores?.modules && report && (
        <section className="space-y-6">
          <div className="rounded-3xl border bg-gradient-to-br from-primary/10 to-card p-6">
            <p className="text-sm text-muted-foreground">Resultado estimado por módulo</p>
            {mock.exam !== "TESTDAF" && (
              <p className="mt-1 font-heading text-2xl font-extrabold">
                {scores.certificate ? "Los cuatro módulos aprobados: equivale al certificado completo" : "Aún no apruebas los cuatro módulos"}
              </p>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {scores.modules.map((m) => (
                <div key={m.section} className="rounded-2xl border bg-card p-4">
                  <p className="font-semibold">{m.name}</p>
                  <p className="font-heading text-3xl font-extrabold tabular-nums">{m.label}</p>
                  {m.pass !== undefined && (
                    <p className={cn("mt-1 text-xs font-bold", m.pass ? "text-emerald-600" : "text-rose-600")}>{m.pass ? "Aprobado" : "No aprobado"}</p>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Nota estimada, no oficial. La forma sigue en calibración.</p>
          </div>
          <div className="rounded-3xl border bg-card p-6">
            <p className="font-semibold">Tu informe</p>
            <p className="mt-2 leading-relaxed text-muted-foreground">{report.narrative}</p>
            <ol className="mt-4 space-y-2">
              {(report.improvements as { titleEs: string; detailEs: string }[]).map((m, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                  <span>
                    <b>{m.titleEs}.</b> {m.detailEs}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <Link href={`/app/examenes?examen=${mock.exam}`} className={buttonVariants({ variant: "outline" })}>
            Volver a exámenes
          </Link>
        </section>
      )}

      {mock.status === "COMPLETED" && scores && !scores.modules && report && (
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
            <div className="rounded-3xl border bg-gradient-to-br from-primary/10 to-card p-6">
              <p className="text-sm text-muted-foreground">Banda general estimada</p>
              <p className="mt-1 font-heading text-7xl font-extrabold tabular-nums">{scores.overall !== null ? scores.overall.toFixed(1) : "—"}</p>
              <p className="mt-2 text-sm">{scores.cefr ? `MCER ${scores.cefr}` : "Sin Speaking no hay banda general."}</p>
              <p className="mt-3 text-xs text-muted-foreground">Nota estimada, no oficial. La forma sigue en calibración.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Band label="Listening" value={scores.listening?.band} detail={scores.listening ? `${scores.listening.correct}/40` : undefined} />
              <Band label="Reading" value={scores.reading?.band} detail={scores.reading ? `${scores.reading.correct}/40` : undefined} />
              <Band
                label="Writing"
                value={scores.writing?.band}
                detail={scores.writing ? `Task 1: ${scores.writing.task1 ?? "—"} · Task 2: ${scores.writing.task2 ?? "—"}` : undefined}
              />
              <Band label="Speaking" value={scores.speaking?.band} detail={scores.speaking ? undefined : "Omitido"} />
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-6">
            <p className="font-semibold">Tu informe</p>
            <p className="mt-2 leading-relaxed text-muted-foreground">{report.narrative}</p>
            <ol className="mt-4 space-y-2">
              {(report.improvements as { titleEs: string; detailEs: string }[]).map((m, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                  <span>
                    <b>{m.titleEs}.</b> {m.detailEs}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <StatList title="Fortalezas" items={report.strengths as { key: string; correct: number; total: number }[]} good />
            <StatList title="Para practicar" items={report.weaknesses as { key: string; correct: number; total: number }[]} />
            <div className="rounded-3xl border bg-card p-5">
              <p className="font-semibold">Tiempo y foco</p>
              <ul className="mt-3 space-y-2 text-sm">
                {(report.timing as { stage: string; minutes: number | null; unanswered: number | null; tabSwitches: number; status: string }[]).map((t) => (
                  <li key={t.stage} className="flex justify-between gap-2">
                    <span>{t.stage.charAt(0) + t.stage.slice(1).toLowerCase()}</span>
                    <span className="text-right text-muted-foreground">
                      {t.status === "SKIPPED" ? "omitido" : `${t.minutes ?? "—"} min`}
                      {t.unanswered ? ` · ${t.unanswered} sin responder` : ""}
                      {t.tabSwitches ? ` · ${t.tabSwitches} cambios de pestaña` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <Link href={`/app/examenes?examen=${mock.exam}`} className={buttonVariants({ variant: "outline" })}>
            Volver a exámenes
          </Link>
        </section>
      )}
    </div>
  );
}

function Band({ label, value, detail }: { label: string; value?: number; detail?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">{label}</p>
        <p className="font-heading text-3xl font-extrabold tabular-nums">{value !== undefined ? value.toFixed(1) : "—"}</p>
      </div>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function StatList({ title, items, good }: { title: string; items: { key: string; correct: number; total: number }[]; good?: boolean }) {
  return (
    <div className="rounded-3xl border bg-card p-5">
      <p className="font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Sin datos suficientes.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((it) => {
            const [section, type] = it.key.split(":");
            return (
              <li key={it.key} className="flex justify-between gap-2">
                <span>
                  {TASK_TYPE_ES[type] ?? type} <span className="text-muted-foreground">· {section.charAt(0) + section.slice(1).toLowerCase()}</span>
                </span>
                <span className={cn("tabular-nums", good ? "text-emerald-600" : "text-rose-600")}>
                  {it.correct}/{it.total}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
