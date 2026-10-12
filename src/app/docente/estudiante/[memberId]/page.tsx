import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EXAMS } from "@/content/exams";
import { TASK_TYPE_ES } from "@/lib/exams/labels";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { OrgError } from "@/server/org";
import { assignmentDefaults, requireStudentAccess } from "@/server/org/teaching";
import { progressData } from "@/server/study/plan";

export const metadata = { title: "Ficha del estudiante" };

export default function StudentCard(props: PageProps<"/docente/estudiante/[memberId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
      <Card params={props.params} />
    </Suspense>
  );
}

async function Card({ params }: { params: PageProps<"/docente/estudiante/[memberId]">["params"] }) {
  const { memberId } = await params;
  const user = await requireUser(`/docente/estudiante/${memberId}`);
  let student;
  try {
    student = await requireStudentAccess(user, memberId);
  } catch (err) {
    if (err instanceof OrgError) notFound();
    throw err;
  }
  const group = student.studying[0] ? await db.group.findUnique({ where: { id: student.studying[0].groupId } }) : null;
  const exam = group?.exam ?? "IELTS_ACADEMIC";
  const [progress, writing, speaking, plan, assignments] = await Promise.all([
    progressData(student.userId, exam),
    db.writingSubmission.findMany({ where: { attempt: { userId: student.userId, exam } }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.speakingSubmission.findMany({ where: { attempt: { userId: student.userId, exam }, status: { in: ["GRADED", "PENDING"] } }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.studyPlan.findFirst({ where: { userId: student.userId, exam, status: "ACTIVE" }, include: { items: true } }),
    db.assignmentResult.findMany({ where: { memberId }, include: { assignment: true }, orderBy: { assignment: { closesAt: "desc" } } }),
  ]);
  const reviews = await db.teacherReview.findMany({ where: { submissionId: { in: [...writing, ...speaking].map((x) => x.id) } }, orderBy: { createdAt: "desc" } });
  const latest = (id: string) => reviews.find((r) => r.submissionId === id);
  const tasks = progress.mastery.filter((m) => m.key.startsWith("task:")).sort((a, b) => a.value - b.value);
  const { now } = assignmentDefaults();
  const due = plan?.items.filter((i) => i.weekStart.getTime() <= now.getTime()) ?? [];

  return (
    <div className="space-y-8">
      <div>
        {group && (
          <Link href={`/docente/grupo/${group.id}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← {group.name}
          </Link>
        )}
        <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight">{student.user.name}</h1>
        <p className="text-muted-foreground">
          {student.user.email} · {EXAMS[exam].name}
          {student.isMinor && " · menor de edad"}
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-3xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Racha</p>
          <p className="font-heading text-2xl font-extrabold">{progress.streak} días</p>
        </div>
        <div className="rounded-3xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Plan de estudios</p>
          <p className="font-heading text-2xl font-extrabold">{plan ? `${due.filter((i) => i.status === "DONE").length}/${due.length}` : "Sin plan"}</p>
        </div>
        <div className="rounded-3xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Simulacros</p>
          <p className="font-heading text-2xl font-extrabold">{progress.mocks.length}</p>
        </div>
        <div className="rounded-3xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Sin responder</p>
          <p className="font-heading text-2xl font-extrabold">{Math.round(progress.unansweredRate * 100)} %</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border bg-card p-5">
          <h2 className="font-heading text-lg font-bold">Dominio por tipo de pregunta</h2>
          <ul className="mt-3 space-y-2">
            {tasks.map((m) => (
              <li key={m.key}>
                <div className="flex justify-between text-sm">
                  <span>{TASK_TYPE_ES[m.key.slice(5)] ?? m.key}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {Math.round(m.value * 100)} % · {m.n}
                  </span>
                </div>
                <Progress value={m.value * 100} className="mt-1 h-1.5" />
              </li>
            ))}
            {!tasks.length && <li className="text-sm text-muted-foreground">Sin práctica todavía.</li>}
          </ul>
        </div>
        <div className="rounded-3xl border bg-card p-5">
          <h2 className="font-heading text-lg font-bold">Tareas</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {assignments.map((a) => (
              <li key={a.assignmentId} className="flex justify-between gap-2">
                <span>{a.assignment.title}</span>
                <span className={a.status === "DONE" ? "text-emerald-600" : "text-muted-foreground"}>
                  {a.status === "DONE" ? `hecha ${a.completedAt?.toLocaleDateString("es") ?? ""}` : a.assignment.closesAt < now ? "no entregada" : "pendiente"}
                </span>
              </li>
            ))}
            {!assignments.length && <li className="text-muted-foreground">Sin tareas.</li>}
          </ul>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border bg-card p-5">
          <h2 className="font-heading text-lg font-bold">Writing</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {writing.map((w) => {
              const r = latest(w.id);
              return (
                <li key={w.id} className="flex items-center justify-between gap-2">
                  <span>
                    Tarea {w.taskNumber} · {w.words} palabras
                    <span className="block text-xs text-muted-foreground">
                      IA: {w.finalScore ?? "—"}
                      {r && ` · docente: ${r.score}`}
                    </span>
                  </span>
                  {w.status === "GRADED" && (
                    <Link href={`/docente/revision/writing/${w.id}?grupo=${group?.id ?? ""}`} className="text-primary hover:underline">
                      {r ? "Ver o ajustar" : "Revisar"}
                    </Link>
                  )}
                </li>
              );
            })}
            {!writing.length && <li className="text-muted-foreground">Sin entregas.</li>}
          </ul>
        </div>
        <div className="rounded-3xl border bg-card p-5">
          <h2 className="font-heading text-lg font-bold">Speaking</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {speaking.map((s) => {
              const r = latest(s.id);
              return (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span>
                    Parte {s.part}
                    <span className="block text-xs text-muted-foreground">
                      IA: {s.finalScore ?? "calificando"}
                      {r && ` · docente: ${r.score}`}
                    </span>
                  </span>
                  {s.status === "GRADED" && (
                    <Link href={`/docente/revision/speaking/${s.id}?grupo=${group?.id ?? ""}`} className="text-primary hover:underline">
                      {r ? "Ver o ajustar" : "Revisar"}
                    </Link>
                  )}
                </li>
              );
            })}
            {!speaking.length && <li className="text-muted-foreground">Sin grabaciones.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
