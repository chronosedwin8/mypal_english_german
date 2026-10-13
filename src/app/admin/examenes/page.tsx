import Link from "next/link";
import { Suspense } from "react";

import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ItemSetStatus } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";
import { examBankOverview } from "@/server/admin/exams";
import { requireStaff } from "@/server/auth/dal";

import { buildForm } from "./actions";

export const metadata = { title: "Admin · Exámenes" };

const STATUSES: { value: ItemSetStatus | "ALL"; label: string }[] = [
  { value: "REVIEW", label: "Por revisar" },
  { value: "APPROVED", label: "Aprobados" },
  { value: "DRAFT", label: "Borradores" },
  { value: "REJECTED", label: "Rechazados" },
  { value: "RETIRED", label: "Retirados" },
  { value: "ALL", label: "Todos" },
];

const SECTION_ES: Record<string, string> = { LISTENING: "Listening", READING: "Reading", WRITING: "Writing", SPEAKING: "Speaking" };

const usd = (micro: bigint) => `$${(Number(micro) / 1e6).toFixed(2)}`;

export default function ExamsAdminPage(props: PageProps<"/admin/examenes">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Bank searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Bank({ searchParams }: { searchParams: PageProps<"/admin/examenes">["searchParams"] }) {
  await requireStaff();
  const sp = await searchParams;
  const estado = typeof sp.estado === "string" && STATUSES.some((s) => s.value === sp.estado) ? (sp.estado as ItemSetStatus | "ALL") : "REVIEW";
  const aviso = typeof sp.aviso === "string" ? sp.aviso : null;
  const { config, inventory, blocks, jobs, forms, spend } = await examBankOverview(estado);
  const exams = [...new Set(inventory.map((r) => r.exam))];

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold">Banco de exámenes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Contenido escrito por el equipo y cargado con <code>pnpm bank import</code>: validación con código y audio con
            ElevenLabs verificado con Scribe. Mínimo por parte: <b>{config.minPerPart}</b>.
          </p>
        </div>
        <Link href="/admin/calibracion" className="text-sm font-medium text-primary hover:underline">
          Calibración y precisión →
        </Link>
      </div>

      {aviso && <p className="rounded-xl border bg-card px-4 py-3 text-sm">{aviso}</p>}

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Gasto de IA y voz hoy" value={usd(spend.todayMicroUsd)} hint={`tope diario $${config.dailyBudgetUsd}`} />
        <Stat label="Gasto este mes" value={usd(spend.monthMicroUsd)} hint={spend.byPurpose.slice(0, 3).map((p) => `${p.purpose} ${usd(p.microUsd)}`).join(" · ")} />
        <Stat
          label="Voz este mes"
          value={`${spend.voiceChars.toLocaleString("es")} car.`}
          hint={`tope ${config.monthlyCharBudget.toLocaleString("es")} caracteres`}
        />
      </section>

      <section>
        <h2 className="font-semibold">Inventario por parte</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm [&_td]:px-3 [&_th]:px-3">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="p-3">Examen</th>
                <th>Sección</th>
                <th>Parte</th>
                <th className="text-right">Aprobados</th>
                <th className="text-right">Por revisar</th>
                <th className="text-right">Borrador</th>
                <th className="text-right">Rechazados</th>
                <th className="text-right">En cola</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((r) => {
                const low = r.approved + r.review < config.minPerPart;
                return (
                  <tr key={`${r.exam}-${r.section}-${r.part}`} className="border-t">
                    <td className="p-3">{r.exam}</td>
                    <td>{SECTION_ES[r.section]}</td>
                    <td>{r.part}</td>
                    <td className={cn("text-right tabular-nums font-semibold", low && "text-rose-600")}>{r.approved}</td>
                    <td className="text-right tabular-nums">{r.review}</td>
                    <td className="text-right tabular-nums">{r.draft}</td>
                    <td className="text-right tabular-nums text-muted-foreground">{r.rejected}</td>
                    <td className="text-right tabular-nums">{r.pending}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Los trabajos los ejecuta el worker (<code>pnpm worker</code>). En IELTS, Speaking Parte 3 sale del bloque de la Parte 2.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Formas de simulacro</h2>
            {exams.map((exam) => (
              <form key={exam} action={buildForm}>
                <input type="hidden" name="exam" value={exam} />
                <Button type="submit" size="sm">
                  Armar forma {exam === "IELTS_ACADEMIC" ? "IELTS" : exam}
                </Button>
              </form>
            ))}
          </div>
          <ul className="mt-3 divide-y rounded-2xl border bg-card text-sm">
            {forms.length === 0 && <li className="p-3 text-muted-foreground">Todavía no hay formas.</li>}
            {forms.map((f) => (
              <li key={f.id} className="flex items-center justify-between p-3">
                <span>
                  {f.exam} · forma {f.version}
                </span>
                <span className="text-muted-foreground">
                  {f.count} bloques · {f.calibrated ? "calibrada" : "en calibración"}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-semibold">Últimos trabajos</h2>
          <ul className="mt-3 divide-y rounded-2xl border bg-card text-sm">
            {jobs.length === 0 && <li className="p-3 text-muted-foreground">Sin trabajos.</li>}
            {jobs.map((j) => {
              const p = j.payload as { section?: string; part?: number; itemSetId?: string };
              return (
                <li key={j.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {j.type} {p.section ? `· ${SECTION_ES[p.section]} ${p.part}` : ""}
                    </span>
                    <StatusBadge status={j.status} />
                  </div>
                  {j.error && <p className="mt-1 line-clamp-2 text-xs text-rose-600">{j.error}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold">Bloques</h2>
          {STATUSES.map((s) => (
            <Link
              key={s.value}
              href={`/admin/examenes?estado=${s.value}`}
              className={cn("rounded-lg px-3 py-1 text-sm", estado === s.value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {s.label}
            </Link>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm [&_td]:px-3 [&_th]:px-3">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="p-3">Tema</th>
                <th>Parte</th>
                <th>Tipos</th>
                <th className="text-right">Banda</th>
                <th className="text-right">Juez</th>
                <th className="text-right">Costo</th>
                <th className="p-3 text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {blocks.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-3 text-muted-foreground">
                    No hay bloques en este estado.
                  </td>
                </tr>
              )}
              {blocks.map((b) => (
                <tr key={b.id} className="border-t hover:bg-muted/40">
                  <td className="p-3">
                    <Link href={`/admin/examenes/${b.id}`} className="font-medium hover:underline">
                      {b.topic}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">
                    {SECTION_ES[b.section]} {b.part}
                  </td>
                  <td className="text-xs text-muted-foreground">{b.taskTypes.join(", ")}</td>
                  <td className="text-right tabular-nums">{b.difficulty.toFixed(1)}</td>
                  <td className="text-right tabular-nums">{b.qualityScore?.toFixed(1) ?? "—"}</td>
                  <td className="text-right tabular-nums">{usd(b.costMicroUsd)}</td>
                  <td className="p-3 text-right">
                    <StatusBadge status={b.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

