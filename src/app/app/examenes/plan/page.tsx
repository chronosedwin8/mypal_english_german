import { CalendarDaysIcon, CheckIcon, TargetIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { StudyPlanItem } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/dal";
import { STUDY_SECTIONS } from "@/server/study/planner-core";
import { planView } from "@/server/study/plan";

import { savePlanAction, setPlanItemAction, startMockAction, startPracticeAction, startSpeakingAction, startWritingAction } from "../actions";

export const metadata = { title: "Mi plan de estudios" };

const EXAM = "IELTS_ACADEMIC" as const;
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const SECTION_ES: Record<string, string> = { LISTENING: "Listening", READING: "Reading", WRITING: "Writing", SPEAKING: "Speaking" };

export default function PlanPage(props: PageProps<"/app/examenes/plan">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
      <Plan searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Plan({ searchParams }: { searchParams: PageProps<"/app/examenes/plan">["searchParams"] }) {
  const user = await requireUser("/app/examenes/plan");
  const sp = await searchParams;
  const aviso = typeof sp.aviso === "string" ? sp.aviso : null;
  const view = await planView(user.id, EXAM);

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      <div>
        <Link href="/app/examenes" className="text-sm text-muted-foreground hover:text-foreground">
          ← Exámenes
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-extrabold tracking-tight">Mi plan de estudios · IELTS</h1>
        <p className="mt-1 text-muted-foreground">Se ajusta solo después de cada práctica y cada simulacro.</p>
      </div>
      {aviso && <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{aviso}</p>}

      {view ? <ActivePlan view={view} /> : null}

      <details className="rounded-3xl border bg-card p-6" open={!view}>
        <summary className="cursor-pointer font-heading text-lg font-bold">{view ? "Cambiar meta o disponibilidad" : "Crea tu plan en un minuto"}</summary>
        <PlanForm defaults={view ? { target: view.targets.overall, examDate: view.plan.examDate, hours: view.plan.hoursPerWeek, days: view.plan.days } : null} />
      </details>
    </div>
  );
}

function PlanForm({ defaults }: { defaults: { target: number; examDate: Date | null; hours: number; days: number[] } | null }) {
  const bands = Array.from({ length: 9 }, (_, i) => 5 + i * 0.5);
  return (
    <form action={savePlanAction} className="mt-5 grid gap-5 sm:grid-cols-2">
      <input type="hidden" name="exam" value={EXAM} />
      <label className="space-y-1.5 text-sm font-medium">
        Banda objetivo
        <select name="target" defaultValue={String(defaults?.target ?? 6.5)} className="h-10 w-full rounded-xl border bg-background px-3">
          {bands.map((b) => (
            <option key={b} value={b}>
              {b.toFixed(1)}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Fecha de tu examen (opcional)
        <input type="date" name="examDate" defaultValue={defaults?.examDate ? defaults.examDate.toISOString().slice(0, 10) : ""} className="h-10 w-full rounded-xl border bg-background px-3" />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Horas por semana
        <input type="number" name="hoursPerWeek" min={1} max={40} defaultValue={defaults?.hours ?? 5} className="h-10 w-full rounded-xl border bg-background px-3" />
      </label>
      <fieldset className="space-y-1.5 text-sm font-medium">
        <legend>Días que puedes estudiar</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-normal">
              <input type="checkbox" name="days" value={i} defaultChecked={defaults ? defaults.days.includes(i) : [1, 3, 5].includes(i)} className="accent-primary" />
              {d}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <Button type="submit">{defaults ? "Recalcular mi plan" : "Crear mi plan"}</Button>
      </div>
    </form>
  );
}

function ActivePlan({ view }: { view: NonNullable<Awaited<ReturnType<typeof planView>>> }) {
  const { plan, targets, current, currentOverall, daysLeft } = view;
  const projection = { projectedOverall: view.projectedOverall, warning: view.warning };
  const weekDone = view.thisWeek.filter((i) => i.status === "DONE").reduce((s, i) => s + i.minutes, 0);
  const weekTotal = view.thisWeek.reduce((s, i) => s + i.minutes, 0);
  const groups = new Map<string, StudyPlanItem[]>();
  for (const i of view.upcoming) {
    const k = i.weekStart.toISOString().slice(0, 10);
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }

  return (
    <>
      <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-3xl border bg-gradient-to-br from-primary/10 to-card p-6">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <TargetIcon className="size-4" /> Meta
          </p>
          <p className="font-heading text-5xl font-extrabold">{targets.overall.toFixed(1)}</p>
          <p className="mt-2 text-sm">
            Hoy: <b>{currentOverall !== null ? currentOverall.toFixed(1) : "sin estimar"}</b>
            {projection.projectedOverall !== null && (
              <>
                {" "}
                · proyección: <b>{projection.projectedOverall.toFixed(1)}</b>
              </>
            )}
          </p>
          {daysLeft !== null && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDaysIcon className="size-4" /> Faltan {daysLeft} días · {plan.hoursPerWeek} h por semana
            </p>
          )}
          {currentOverall === null && (
            <p className="mt-3 text-xs text-muted-foreground">Haz una sección cronometrada de cada parte (o un simulacro) para estimar tu nota de partida.</p>
          )}
          {projection.warning && (
            <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" /> {projection.warning}
            </p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {STUDY_SECTIONS.map((s) => {
            const v = current[s];
            const t = targets.sections?.[s] ?? targets.overall;
            return (
              <div key={s} className="rounded-2xl border bg-card p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold">{SECTION_ES[s]}</p>
                  <p className="tabular-nums">
                    <b className="text-xl">{v !== null ? v.toFixed(1) : "—"}</b>
                    <span className="text-sm text-muted-foreground"> / {t.toFixed(1)}</span>
                  </p>
                </div>
                <Progress value={v !== null ? Math.min(100, (v / t) * 100) : 0} className="mt-2 h-1.5" />
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-heading text-xl font-bold">Esta semana</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {weekDone} de {weekTotal} minutos
          </p>
        </div>
        <Progress value={weekTotal ? (weekDone / weekTotal) * 100 : 0} className="mt-2 h-2" />
        <ul className="mt-4 space-y-2">
          {[...view.overdue, ...view.thisWeek].map((i) => (
            <PlanItem key={i.id} item={i} overdue={view.overdue.includes(i)} />
          ))}
          {!view.thisWeek.length && !view.overdue.length && <li className="text-sm text-muted-foreground">No hay tareas esta semana.</li>}
        </ul>
      </section>

      {groups.size > 0 && (
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-bold">Próximas semanas</h2>
          {[...groups.entries()].slice(0, 8).map(([week, items]) => (
            <details key={week} className="rounded-2xl border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Semana del {new Date(week).toLocaleDateString("es", { day: "numeric", month: "long", timeZone: "UTC" })} · {items.reduce((s, i) => s + i.minutes, 0)} min
                {items.some((i) => i.kind === "MOCK") && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">simulacro</span>}
              </summary>
              <ul className="mt-3 space-y-1 text-sm">
                {items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2">
                    <span>
                      {i.title}
                      {i.origin === "MOCK" && <span className="ml-1 text-xs text-primary">· plan de mejora</span>}
                    </span>
                    <span className="text-muted-foreground tabular-nums">{i.minutes} min</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      )}
    </>
  );
}

function StartItem({ item }: { item: StudyPlanItem }) {
  const btn = (label = "Empezar") => (
    <Button type="submit" size="sm" variant="outline" className="h-8 rounded-full">
      {label}
    </Button>
  );
  switch (item.kind) {
    case "DRILL":
    case "PART":
    case "SECTION":
      return (
        <form action={startPracticeAction}>
          <input type="hidden" name="exam" value={EXAM} />
          <input type="hidden" name="mode" value={item.kind} />
          <input type="hidden" name="section" value={item.section ?? "READING"} />
          {item.part && <input type="hidden" name="part" value={item.part} />}
          {item.taskType && <input type="hidden" name="taskType" value={item.taskType} />}
          {btn()}
        </form>
      );
    case "WRITING":
      return (
        <form action={startWritingAction}>
          <input type="hidden" name="exam" value={EXAM} />
          <input type="hidden" name="task" value={item.part ?? 2} />
          <input type="hidden" name="timed" value="on" />
          {btn()}
        </form>
      );
    case "SPEAKING":
      return (
        <form action={startSpeakingAction}>
          <input type="hidden" name="exam" value={EXAM} />
          <input type="hidden" name="parts" value={String(item.part ?? 1)} />
          {btn()}
        </form>
      );
    case "MOCK":
      return (
        <form action={startMockAction}>
          <input type="hidden" name="exam" value={EXAM} />
          {btn("Hacer simulacro")}
        </form>
      );
    case "VOCAB":
      return (
        <Link href="/app/vocabulario" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 rounded-full")}>
          Repasar
        </Link>
      );
    default:
      return (
        <Link href="/app/practicar" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 rounded-full")}>
          Ir al tutor
        </Link>
      );
  }
}

function PlanItem({ item, overdue }: { item: StudyPlanItem; overdue?: boolean }) {
  const done = item.status === "DONE";
  return (
    <li className={cn("flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3", done && "opacity-60", overdue && "border-amber-300")}>
      <form action={setPlanItemAction}>
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="status" value={done ? "TODO" : "DONE"} />
        <button
          type="submit"
          aria-label={done ? "Marcar como pendiente" : "Marcar como hecha"}
          className={cn("grid size-6 place-items-center rounded-full border-2", done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary")}
        >
          {done && <CheckIcon className="size-3.5" />}
        </button>
      </form>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", done && "line-through")}>{item.title}</p>
        <p className="text-xs text-muted-foreground">
          {item.minutes} min · {overdue ? "pendiente de la semana pasada" : item.dueDate.toLocaleDateString("es", { weekday: "long", timeZone: "UTC" })}
          {item.origin === "MOCK" && " · plan de mejora del simulacro"}
        </p>
      </div>
      {!done && <StartItem item={item} />}
    </li>
  );
}
