import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EXAMS } from "@/content/exams";
import { TASK_TYPE_ES } from "@/lib/exams/labels";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { OrgError } from "@/server/org";
import { assignmentDefaults, groupOverview, pendingReviews, requireGroupAccess, type TrafficLight } from "@/server/org/teaching";

import { createAssignmentAction, groupAvatarAction, groupCodeAction } from "../../actions";

export const metadata = { title: "Grupo" };

const LIGHT: Record<TrafficLight, { label: string; dot: string }> = {
  ON_TRACK: { label: "En meta", dot: "bg-emerald-500" },
  AT_RISK: { label: "En riesgo", dot: "bg-amber-500" },
  INACTIVE: { label: "Inactivo", dot: "bg-rose-500" },
  NO_DATA: { label: "Sin datos", dot: "bg-muted-foreground/40" },
};
const KIND_ES: Record<string, string> = { PRACTICE: "Práctica", WRITING: "Writing", SPEAKING: "Speaking", MOCK: "Simulacro institucional" };

export default function GroupPage(props: PageProps<"/docente/grupo/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[70vh] w-full rounded-3xl" />}>
      <Group params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

function fmt(exam: string, v: number | null) {
  if (v === null) return "—";
  return exam === "IELTS_ACADEMIC" ? v.toFixed(1) : String(Math.round(v));
}

async function Group({ params, searchParams }: { params: PageProps<"/docente/grupo/[id]">["params"]; searchParams: PageProps<"/docente/grupo/[id]">["searchParams"] }) {
  const { id } = await params;
  const sp = await searchParams;
  const aviso = typeof sp.aviso === "string" ? sp.aviso : null;
  const user = await requireUser(`/docente/grupo/${id}`);
  try {
    await requireGroupAccess(user, id);
  } catch (err) {
    if (err instanceof OrgError) notFound();
    throw err;
  }
  const [{ group, students, heatmap, kpis }, reviews, avatarRule] = await Promise.all([
    groupOverview(id),
    pendingReviews(id),
    db.accessRule.findUnique({ where: { scope_scopeId_resource: { scope: "GROUP", scopeId: id, resource: "tutor.avatar" } } }),
  ]);
  const spec = EXAMS[group.exam];
  const objective = spec.sections.filter((s) => s.section === "LISTENING" || s.section === "READING");
  const { now, opensAt, closesAt } = assignmentDefaults();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/docente" className="text-sm text-muted-foreground hover:text-foreground">
            ← Mis grupos
          </Link>
          <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight">{group.name}</h1>
          <p className="text-muted-foreground">
            {spec.name}
            {group.targetDate && ` · examen el ${group.targetDate.toLocaleDateString("es")}`}
            {group.targetScore !== null && ` · meta ${fmt(group.exam, group.targetScore)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={groupCodeAction}>
            <input type="hidden" name="groupId" value={id} />
            <Button type="submit" variant="outline" size="sm">
              Código para estudiantes
            </Button>
          </form>
          <a href={`/api/org/grupos/${id}/export`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <DownloadIcon /> Exportar CSV
          </a>
        </div>
      </div>
      {aviso && <p className="rounded-2xl border bg-card px-4 py-3 text-sm">{aviso}</p>}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Activos en 7 días", value: `${kpis.active7} / ${kpis.students}` },
          { label: "Nota estimada promedio", value: fmt(group.exam, kpis.averageEstimate) },
          { label: "Camino a la meta", value: `${kpis.onTrack} en meta · ${kpis.atRisk} en riesgo` },
          { label: "Tareas al día", value: kpis.assignmentCompletion === null ? "—" : `${Math.round(kpis.assignmentCompletion * 100)} %` },
        ].map((k) => (
          <div key={k.label} className="rounded-3xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">{k.label}</p>
            <p className="mt-1 font-heading text-2xl font-extrabold">{k.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-3xl border bg-card p-5">
          <h2 className="font-heading text-lg font-bold">Estudiantes</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm [&_td]:px-2 [&_td]:py-2 [&_th]:px-2">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th>Estudiante</th>
                  <th className="text-right">Nota</th>
                  <th className="text-right">Simulacros</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.memberId} className="border-t">
                    <td>
                      <Link href={`/docente/estudiante/${s.memberId}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                      {s.isMinor && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-900">MENOR</span>}
                      <span className="block text-xs text-muted-foreground">{s.lastActivity ? `activo ${s.lastActivity.toLocaleDateString("es")}` : "sin actividad"}</span>
                    </td>
                    <td className="text-right tabular-nums">{fmt(group.exam, s.estimate)}</td>
                    <td className="text-right tabular-nums">{s.mocks}</td>
                    <td>
                      <span className="flex items-center gap-1.5">
                        <span className={cn("size-2.5 rounded-full", LIGHT[s.status].dot)} /> {LIGHT[s.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
                {!students.length && (
                  <tr>
                    <td colSpan={4} className="text-muted-foreground">
                      Aún no hay estudiantes. Comparte el código del grupo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-5">
          <h2 className="font-heading text-lg font-bold">Dónde falla el grupo</h2>
          <p className="text-xs text-muted-foreground">Una columna por estudiante; más oscuro = más errores.</p>
          {heatmap.length ? (
            <table className="mt-3 w-full text-xs">
              <tbody>
                {heatmap.map((row) => (
                  <tr key={row.taskType}>
                    <td className="py-1 pr-2">{TASK_TYPE_ES[row.taskType] ?? row.taskType}</td>
                    {row.cells.map((c, i) => (
                      <td key={i} className="p-0.5">
                        <span
                          title={c === null ? "sin datos" : `${Math.round(c * 100)} % de errores`}
                          className="block size-5 rounded"
                          style={{ background: c === null ? "transparent" : `rgba(225, 29, 72, ${0.12 + c * 0.88})`, outline: c === null ? "1px dashed var(--border)" : undefined }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Aparecerá cuando el grupo practique.</p>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border bg-card p-5">
          <h2 className="font-heading text-lg font-bold">Tareas</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {group.assignments.map((a) => {
              const done = a.results.filter((r) => r.status === "DONE").length;
              return (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2">
                  <span>
                    <b>{a.title}</b>
                    <span className="block text-xs text-muted-foreground">
                      {KIND_ES[a.kind]} · cierra {a.closesAt.toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}
                      {a.closesAt < now && " (cerrada)"}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {done}/{a.results.length}
                  </span>
                </li>
              );
            })}
            {!group.assignments.length && <li className="text-muted-foreground">Sin tareas todavía.</li>}
          </ul>
          <form action={createAssignmentAction} className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2">
            <input type="hidden" name="groupId" value={id} />
            <input name="title" required placeholder="Título (p. ej. Simulacro de mitad de curso)" className="h-9 rounded-lg border bg-background px-2 text-sm sm:col-span-2" />
            <select name="kind" className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Tipo">
              <option value="PRACTICE">Práctica</option>
              <option value="WRITING">Writing</option>
              <option value="SPEAKING">Speaking</option>
              <option value="MOCK">Simulacro institucional</option>
            </select>
            <select name="mode" className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Modo de práctica">
              <option value="PART">Por parte</option>
              <option value="DRILL">Por tipo de pregunta</option>
              <option value="SECTION">Sección cronometrada</option>
            </select>
            <select name="section" className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Sección">
              {objective.map((s) => (
                <option key={s.section} value={s.section}>
                  {s.name}
                </option>
              ))}
            </select>
            <select name="taskType" className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Tipo de pregunta">
              <option value="">Tipo de pregunta (opcional)</option>
              {[...new Set(objective.flatMap((s) => s.parts.flatMap((p) => p.taskTypes)))].map((t) => (
                <option key={t} value={t}>
                  {TASK_TYPE_ES[t] ?? t}
                </option>
              ))}
            </select>
            <input name="part" type="number" min={1} max={9} placeholder="Parte o tarea (opcional)" className="h-9 rounded-lg border bg-background px-2 text-sm" />
            <label className="text-xs text-muted-foreground">
              Abre
              <input name="opensAt" type="datetime-local" required defaultValue={opensAt} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm" />
            </label>
            <label className="text-xs text-muted-foreground">
              Cierra
              <input name="closesAt" type="datetime-local" required defaultValue={closesAt} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm" />
            </label>
            <Button type="submit" size="sm" className="sm:col-span-2">
              Asignar al grupo
            </Button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border bg-card p-5">
            <h2 className="font-heading text-lg font-bold">Revisiones pendientes</h2>
            <p className="text-xs text-muted-foreground">Tu nota reemplaza la de la IA y sirve para calibrar el calificador.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {reviews.slice(0, 10).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span>
                    {r.kind === "WRITING" ? "Writing" : "Speaking"} · {r.student}
                    <span className="block text-xs text-muted-foreground">IA: {fmt(group.exam, r.aiScore)}</span>
                  </span>
                  <Link href={`/docente/revision/${r.kind.toLowerCase()}/${r.id}?grupo=${id}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
                    Revisar
                  </Link>
                </li>
              ))}
              {!reviews.length && <li className="text-muted-foreground">Nada pendiente.</li>}
            </ul>
          </div>
          <div className="rounded-3xl border bg-card p-5">
            <h2 className="font-heading text-lg font-bold">Tutor con avatar en este grupo</h2>
            <p className="text-sm text-muted-foreground">{avatarRule && !avatarRule.allowed ? "Apagado para este grupo." : "Disponible según la configuración de la institución."}</p>
            <form action={groupAvatarAction} className="mt-3">
              <input type="hidden" name="groupId" value={id} />
              <input type="hidden" name="allowed" value={avatarRule && !avatarRule.allowed ? "true" : "false"} />
              <Button type="submit" size="sm" variant="outline">
                {avatarRule && !avatarRule.allowed ? "Volver a activarlo" : "Apagarlo para el grupo"}
              </Button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
