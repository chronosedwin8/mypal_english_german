import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { EXAMS } from "@/content/exams";
import { MODE_ES, SECTION_ES, TASK_TYPE_ES } from "@/lib/exams/labels";
import { accountSummary } from "@/server/app-data";
import { requireStaff } from "@/server/auth/dal";
import { db } from "@/server/db";
import { quotaSummary } from "@/server/exams/entitlements";
import { planView, progressData } from "@/server/study/plan";

export const metadata = { title: "Admin · Ver como" };

/**
 * Soporte: lo que la persona ve, en solo lectura. Cada ingreso queda en la auditoria.
 * No se muestran grabaciones ni transcripciones (y nunca las de menores).
 */
export default function ViewAs(props: PageProps<"/admin/usuarios/[id]/ver">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <View params={props.params} />
    </Suspense>
  );
}

async function View({ params }: { params: PageProps<"/admin/usuarios/[id]/ver">["params"] }) {
  const staff = await requireStaff();
  const { id } = await params;
  const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
  if (!user) notFound();
  await db.auditLog.create({ data: { actorUserId: staff.id, action: "admin.view_as", entity: "User", entityId: id } });

  const exams = await db.examAttempt.groupBy({ by: ["exam"], where: { userId: id }, _count: true });
  const [acc, quota, attempts, memberships] = await Promise.all([
    accountSummary(id),
    quotaSummary(id),
    db.examAttempt.findMany({ where: { userId: id }, orderBy: { startedAt: "desc" }, take: 15, select: { id: true, exam: true, mode: true, status: true, overall: true, config: true, startedAt: true } }),
    db.orgMember.findMany({ where: { userId: id, status: "ACTIVE" }, include: { org: { select: { name: true } } } }),
  ]);
  const perExam = await Promise.all(exams.map(async (e) => ({ exam: e.exam, plan: await planView(id, e.exam), progress: await progressData(id, e.exam) })));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/usuarios/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Ficha
        </Link>
        <h1 className="mt-1 font-heading text-2xl font-extrabold">Ver como {user.name}</h1>
        <p className="text-sm text-muted-foreground">
          {user.email} · solo lectura · este ingreso quedó en la auditoría
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5 text-sm">
          <p className="font-semibold">Plan y minutos</p>
          <p className="mt-1">{acc.subscription ? `${acc.subscription.plan.nameEs} (${acc.subscription.status})` : "Sin plan con tutor"}</p>
          <p className="text-muted-foreground">{Math.floor(acc.balance.paidAvailableSeconds / 60)} min disponibles · prueba {acc.trialAvailable ? "disponible" : "usada"}</p>
        </div>
        <div className="rounded-2xl border bg-card p-5 text-sm">
          <p className="font-semibold">Cupos de examen</p>
          <p className="mt-1">
            {quota.MOCK.available} simulacros · {quota.WRITING.available} Writing · {quota.SPEAKING.available} Speaking
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-5 text-sm">
          <p className="font-semibold">Instituciones</p>
          <p className="mt-1">{memberships.map((m) => `${m.org.name} (${m.role.toLowerCase()})`).join(", ") || "Ninguna"}</p>
        </div>
      </section>

      {perExam.map(({ exam, plan, progress }) => (
        <section key={exam} className="space-y-3 rounded-2xl border bg-card p-5 text-sm">
          <h2 className="font-heading text-lg font-bold">{EXAMS[exam].name}</h2>
          <p>
            Plan: {plan ? `meta ${plan.targets.overall}, ${plan.plan.hoursPerWeek} h/semana, ${plan.thisWeek.filter((i) => i.status === "DONE").length}/${plan.thisWeek.length} tareas esta semana` : "sin plan"} · racha {progress.streak} días ·{" "}
            {progress.mocks.length} simulacros
          </p>
          <div className="flex flex-wrap gap-2">
            {progress.mastery
              .filter((m) => m.key.startsWith("task:"))
              .map((m) => (
                <span key={m.key} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                  {TASK_TYPE_ES[m.key.slice(5)] ?? m.key}: {Math.round(m.value * 100)} %
                </span>
              ))}
          </div>
        </section>
      ))}

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Actividad reciente</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {attempts.map((a) => (
            <li key={a.id} className="flex justify-between gap-2">
              <span>
                {EXAMS[a.exam].shortName} · {MODE_ES[a.mode] ?? a.mode}
                {(a.config as { section?: string }).section ? ` · ${SECTION_ES[(a.config as { section: string }).section]}` : ""}
              </span>
              <span className="text-muted-foreground">
                {a.status.toLowerCase()}
                {a.overall !== null ? ` · ${a.overall}` : ""} · {a.startedAt.toLocaleDateString("es")}
              </span>
            </li>
          ))}
          {!attempts.length && <li className="text-muted-foreground">Sin actividad de exámenes.</li>}
        </ul>
      </section>
    </div>
  );
}
