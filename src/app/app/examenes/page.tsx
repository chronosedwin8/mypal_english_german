import { ArrowRightIcon, BookOpenTextIcon, ClockIcon, HeadphonesIcon, MicIcon, PenLineIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EXAMS, EXAM_CODES, isExamCode } from "@/content/exams";
import type { ExamCode } from "@/content/exams/types";
import { MODE_ES, SECTION_ES, TASK_TYPE_ES } from "@/lib/exams/labels";
import { cn } from "@/lib/utils";
import { can } from "@/server/access";
import { requireUser } from "@/server/auth/dal";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { quotaSummary } from "@/server/exams/entitlements";
import { BANK_EXAMS } from "@/server/exams/bank/targets";
import { practiceOverview, type PracticeConfig, type PracticeScores } from "@/server/exams/practice";

import { startPracticeAction, startWritingAction } from "./actions";

export const metadata = { title: "Exámenes" };

export default function ExamsPage(props: PageProps<"/app/examenes">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
      <Exams searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Exams({ searchParams }: { searchParams: PageProps<"/app/examenes">["searchParams"] }) {
  const user = await requireUser("/app/examenes");
  const sp = await searchParams;
  const config = await getConfig();
  const enabled = config["exam.enabledExams"];
  const exam: ExamCode = typeof sp.examen === "string" && isExamCode(sp.examen) ? sp.examen : "IELTS_ACADEMIC";
  const aviso = typeof sp.aviso === "string" ? sp.aviso : null;
  const spec = EXAMS[exam];
  const ready = BANK_EXAMS.includes(exam) && config["exam.enabled"];

  return (
    <div className="space-y-10 pb-16 md:pb-0">
      <div>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Exámenes</h1>
        <p className="mt-1 text-muted-foreground">Practica con el formato real y conoce tu nota estimada en la escala oficial.</p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Examen">
        {EXAM_CODES.filter((c) => enabled.includes(c)).map((c) => (
          <Link
            key={c}
            href={`/app/examenes?examen=${c}`}
            role="tab"
            aria-selected={c === exam}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
              c === exam ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {EXAMS[c].name}
            {!BANK_EXAMS.includes(c) && <span className="ml-2 text-xs font-normal opacity-70">pronto</span>}
          </Link>
        ))}
      </div>

      {aviso && <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{aviso}</p>}

      <div className="rounded-3xl border bg-card p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">{spec.shortName}</p>
        <h2 className="mt-1 font-heading text-2xl font-extrabold">{spec.name}</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">{spec.purposeEs}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {spec.levelEs} · {spec.scaleEs}
        </p>
      </div>

      {ready && <PracticeAccess user={user} />}

      {ready ? <IeltsPractice user={user} exam={exam} /> : <ComingSoon name={spec.name} />}

      <p className="text-xs text-muted-foreground">{spec.disclaimerEs}</p>
    </div>
  );
}

async function PracticeAccess({ user }: { user: { id: string; role: "STUDENT" | "ADMIN" } }) {
  const access = await can(user, "exam.practice");
  if (access.allowed) return null;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-primary/30 bg-primary/5 p-5">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{access.reason}</p>
        <p className="text-sm text-muted-foreground">Incluye todos los tipos de pregunta, secciones cronometradas y tu progreso.</p>
      </div>
      <Link href="/app/planes" className={cn(buttonVariants(), "rounded-full")}>
        Ver planes
      </Link>
    </div>
  );
}

async function WritingCard({ user, exam }: { user: { id: string; role: "STUDENT" | "ADMIN" }; exam: ExamCode }) {
  const [access, quota, writing] = await Promise.all([
    can(user, "exam.writing"),
    quotaSummary(user.id),
    db.writingSubmission.findMany({
      where: { attempt: { userId: user.id, exam } },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { attemptId: true, taskNumber: true, finalScore: true, status: true },
    }),
  ]);
  return (
    <div className="flex gap-4 rounded-3xl border bg-card p-5">
      <PenLineIcon className="mt-1 size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Writing con corrección por IA</p>
        <p className="mt-1 text-sm text-muted-foreground">Nota por criterio, errores marcados y tu texto una banda más arriba.</p>
        {access.allowed ? (
          <form action={startWritingAction} className="mt-4 space-y-3">
            <input type="hidden" name="exam" value={exam} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="timed" defaultChecked className="size-4 accent-primary" /> Con tiempo real (20 o 40 min)
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" name="task" value="1" size="sm">
                Task 1 · gráfico
              </Button>
              <Button type="submit" name="task" value="2" size="sm" variant="outline">
                Task 2 · ensayo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {access.unlimited ? "Administrador: sin límite." : `Te quedan ${quota.WRITING.available} correcciones este periodo.`}
            </p>
          </form>
        ) : (
          <div className="mt-4 space-y-2">
            <p className="text-sm">{access.reason}</p>
            <Link href="/app/planes" className={cn(buttonVariants({ size: "sm" }), "rounded-full")}>
              Ver el Pase de examen
            </Link>
          </div>
        )}
        {writing.length > 0 && (
          <ul className="mt-4 space-y-1 border-t pt-3 text-sm">
            {writing.map((w) => (
              <li key={w.attemptId}>
                <Link href={`/app/examenes/writing/${w.attemptId}`} className="flex justify-between hover:underline">
                  <span>Task {w.taskNumber}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {w.status === "GRADED" && w.finalScore !== null ? `banda ${w.finalScore.toFixed(1)}` : w.status === "PENDING" ? "calificando…" : "sin calificar"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="rounded-3xl border border-dashed p-8 text-center">
      <p className="font-heading text-xl font-bold">{name} llega pronto</p>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        Estamos preparando su banco de preguntas con audios nativos. Mientras tanto, practica conversación con tu tutor.
      </p>
      <Link href="/app/practicar" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
        Ir a practicar
      </Link>
    </div>
  );
}

function StartButton(props: {
  exam: ExamCode;
  mode: "DRILL" | "PART" | "SECTION";
  section: "LISTENING" | "READING";
  part?: number;
  taskType?: string;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "default" | "outline";
  className?: string;
}) {
  return (
    <form action={startPracticeAction}>
      <input type="hidden" name="exam" value={props.exam} />
      <input type="hidden" name="mode" value={props.mode} />
      <input type="hidden" name="section" value={props.section} />
      {props.part && <input type="hidden" name="part" value={props.part} />}
      {props.taskType && <input type="hidden" name="taskType" value={props.taskType} />}
      <Button type="submit" variant={props.variant ?? "default"} disabled={props.disabled} className={props.className}>
        {props.children}
      </Button>
    </form>
  );
}

async function IeltsPractice({ user, exam }: { user: { id: string; role: "STUDENT" | "ADMIN" }; exam: ExamCode }) {
  const { mastery, recent, available } = await practiceOverview(user.id, exam);
  const spec = EXAMS[exam];
  const has = (section: string, part?: number) => available.some((a) => a.section === section && (part === undefined || a.part === part) && a._count > 0);
  const objective = spec.sections.filter((s) => s.section === "LISTENING" || s.section === "READING");

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-heading text-xl font-bold">Sección cronometrada</h2>
        <p className="text-sm text-muted-foreground">Como el día del examen: tiempo real y nota en bandas.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {objective.map((s) => {
            const Icon = s.section === "LISTENING" ? HeadphonesIcon : BookOpenTextIcon;
            const complete = s.parts.every((p) => has(s.section, p.part));
            return (
              <div key={s.section} className="flex flex-col rounded-3xl border bg-card p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="font-heading text-lg font-bold">{s.name}</p>
                    <p className="flex items-center gap-1 text-sm text-muted-foreground">
                      <ClockIcon className="size-3.5" /> {s.minutes} min · {s.rawMax} preguntas · {s.parts.length} partes
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StartButton exam={exam} mode="SECTION" section={s.section as "LISTENING" | "READING"} disabled={!complete}>
                    Sección completa <ArrowRightIcon />
                  </StartButton>
                  {s.parts.map((p) => (
                    <StartButton
                      key={p.part}
                      exam={exam}
                      mode="PART"
                      section={s.section as "LISTENING" | "READING"}
                      part={p.part}
                      variant="outline"
                      disabled={!has(s.section, p.part)}
                    >
                      {s.section === "LISTENING" ? "Part" : "Passage"} {p.part}
                    </StartButton>
                  ))}
                </div>
                {!complete && <p className="mt-3 text-xs text-muted-foreground">Estamos completando el material de algunas partes.</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-heading text-xl font-bold">Por tipo de pregunta</h2>
        <p className="text-sm text-muted-foreground">Entrena un tipo a la vez, con explicación en español de cada respuesta.</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {objective.map((s) => {
            const types = [...new Set(s.parts.flatMap((p) => p.taskTypes))];
            return (
              <div key={s.section} className="rounded-3xl border bg-card p-5">
                <p className="font-semibold">{s.name}</p>
                <ul className="mt-3 divide-y">
                  {types.map((t) => {
                    const m = mastery.find((x) => x.key === `task:${t}`);
                    const partsWith = s.parts.filter((p) => p.taskTypes.includes(t)).map((p) => p.part);
                    return (
                      <li key={t} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{TASK_TYPE_ES[t] ?? t}</p>
                          {m ? (
                            <div className="mt-1 flex items-center gap-2">
                              <Progress value={m.value * 100} className="h-1.5 w-28" />
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {Math.round(m.value * 100)} % · {m.n} preguntas
                              </span>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">Sin practicar</p>
                          )}
                        </div>
                        <StartButton
                          exam={exam}
                          mode="DRILL"
                          section={s.section as "LISTENING" | "READING"}
                          taskType={t}
                          variant="outline"
                          disabled={!partsWith.some((p) => has(s.section, p))}
                          className="h-8 rounded-full px-3 text-xs"
                        >
                          Practicar
                        </StartButton>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <WritingCard user={user} exam={exam} />
        <div className="flex gap-4 rounded-3xl border border-dashed p-5">
          <MicIcon className="mt-1 size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-semibold">
              Speaking con examinador por voz <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">pronto</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Las tres partes del examen, con tarjeta y tiempo real.</p>
          </div>
        </div>
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="font-heading text-xl font-bold">Tus prácticas recientes</h2>
          <ul className="mt-3 divide-y rounded-3xl border bg-card">
            {recent.map((a) => {
              const cfg = a.config as unknown as PracticeConfig;
              const sc = a.scores as unknown as PracticeScores | null;
              const href = a.status === "IN_PROGRESS" ? `/app/examenes/practica/${a.id}` : `/app/examenes/resultado/${a.id}`;
              return (
                <li key={a.id}>
                  <Link href={href} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {SECTION_ES[cfg.section]} · {MODE_ES[a.mode]}
                        {cfg.part ? ` · parte ${cfg.part}` : ""}
                        {cfg.taskType ? ` · ${TASK_TYPE_ES[cfg.taskType] ?? cfg.taskType}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">{a.startedAt.toLocaleDateString("es", { day: "numeric", month: "short" })}</p>
                    </div>
                    {a.status === "IN_PROGRESS" ? (
                      <span className="text-sm font-semibold text-primary">Continuar</span>
                    ) : sc ? (
                      <span className="text-right text-sm tabular-nums">
                        <b>
                          {sc.correct}/{sc.total}
                        </b>
                        {sc.band !== null && <span className="ml-2 text-muted-foreground">banda {sc.band.toFixed(1)}</span>}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
