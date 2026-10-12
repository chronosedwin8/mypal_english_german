import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EXAMS } from "@/content/exams";
import { cn } from "@/lib/utils";
import { calibrationOverview, officialAccuracy, teacherAccuracy, type ErrorStats } from "@/server/admin/accuracy";
import { requireStaff } from "@/server/auth/dal";
import { getConfig } from "@/server/config";

import { runCalibration } from "../examenes/actions";

export const metadata = { title: "Admin · Calibración" };

const SECTION_ES = { overall: "General", listening: "Listening", reading: "Reading", writing: "Writing", speaking: "Speaking" } as const;
const fmt = (n: number, d = 2) => (n >= 0 ? "+" : "") + n.toFixed(d);
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function CalibrationPage(props: PageProps<"/admin/calibracion">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Calibration searchParams={props.searchParams} />
    </Suspense>
  );
}

function Stats({ s, unit }: { s: ErrorStats | null; unit: string }) {
  if (!s) return <span className="text-muted-foreground">sin datos</span>;
  return (
    <span className="tabular-nums">
      n={s.n} · sesgo {fmt(s.bias)} {unit} · error medio {s.mae.toFixed(2)} · <b className={s.within >= 0.7 ? "text-emerald-600" : "text-amber-600"}>{pct(s.within)}</b> dentro de la meta
    </span>
  );
}

async function Calibration({ searchParams }: { searchParams: PageProps<"/admin/calibracion">["searchParams"] }) {
  await requireStaff();
  const sp = await searchParams;
  const aviso = typeof sp.aviso === "string" ? sp.aviso : null;
  const [cfg, official, teachers, overview] = await Promise.all([getConfig(), officialAccuracy(), teacherAccuracy(), calibrationOverview()]);
  const ielts = teachers.filter((t) => t.exam === "IELTS_ACADEMIC");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/examenes" className="text-sm text-muted-foreground hover:text-foreground">
            ← Banco de exámenes
          </Link>
          <h1 className="mt-1 font-heading text-3xl font-extrabold">Calibración y precisión</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rasch con uso real (diario): con {cfg["exam.calibration.minResponses"]}+ respuestas por pregunta se mide su dificultad y discriminación; las
            defectuosas mandan su bloque a revisión y las formas completas reciben su propia tabla de conversión.
          </p>
        </div>
        <form action={runCalibration}>
          <Button type="submit" variant="outline">
            Calibrar ahora
          </Button>
        </form>
      </div>
      {aviso && <p className="rounded-xl border bg-card px-4 py-3 text-sm">{aviso}</p>}

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Simulador frente a notas oficiales (IELTS)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {official.reported} notas oficiales reportadas · {official.pairs} con un simulacro en los 120 días previos · meta: ±0,5 banda en la mayoría de los casos.
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {(Object.keys(SECTION_ES) as (keyof typeof SECTION_ES)[]).map((s) => (
            <li key={s} className="grid gap-1 sm:grid-cols-[8rem_1fr]">
              <span className="font-medium">{SECTION_ES[s]}</span>
              <Stats s={official.bySection[s]} unit="bandas" />
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">IA frente a docentes</h2>
        <p className="mt-1 text-xs text-muted-foreground">La nota del docente es la referencia. Sesgo positivo: la IA califica más alto.</p>
        <ul className="mt-3 space-y-1 text-sm">
          {teachers.map((t) => (
            <li key={`${t.exam}-${t.kind}`} className="grid gap-1 sm:grid-cols-[14rem_1fr]">
              <span className="font-medium">
                {EXAMS[t.exam].name} · {t.kind === "WRITING" ? "Writing" : "Speaking"}
              </span>
              <Stats s={t.stats} unit={t.exam === "IELTS_ACADEMIC" ? "bandas" : "puntos"} />
            </li>
          ))}
          {!teachers.length && <li className="text-muted-foreground">Todavía no hay revisiones de docentes.</li>}
        </ul>
        {ielts
          .filter((t) => t.stats.n >= 10 && Math.abs(t.stats.bias) >= 0.25)
          .map((t) => (
            <p key={t.kind} className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              En {t.kind === "WRITING" ? "Writing" : "Speaking"} la IA califica {Math.abs(t.stats.bias).toFixed(2)} bandas {t.stats.bias > 0 ? "más alto" : "más bajo"} que los
              docentes. Ajuste actual: {cfg[t.kind === "WRITING" ? "exam.grader.ieltsWritingOffset" : "exam.grader.ieltsSpeakingOffset"]}. Sugerido:{" "}
              <b>{(Math.round(-t.stats.bias * 4) / 4).toFixed(2)}</b>{" "}
              <Link href="/admin/configuracion" className="underline">
                (Configuración)
              </Link>
            </p>
          ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">Banco calibrado</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {overview.byExam.map((e) => (
              <li key={e.exam} className="flex justify-between gap-2">
                <span>{EXAMS[e.exam].name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {e._count} preguntas · aciertos {pct(e._avg.pCorrect ?? 0)} · discriminación {e._avg.discrimination === null ? "—" : e._avg.discrimination.toFixed(2)}
                </span>
              </li>
            ))}
            {!overview.byExam.length && <li className="text-muted-foreground">Aún no hay respuestas suficientes.</li>}
          </ul>
          <h3 className="mt-4 text-sm font-semibold">Formas</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {overview.forms.map((f) => (
              <li key={`${f.exam}-${f.calibrated}`} className="flex justify-between">
                <span>{EXAMS[f.exam].name}</span>
                <span className={cn("tabular-nums", f.calibrated ? "text-emerald-600" : "text-muted-foreground")}>
                  {f._count} {f.calibrated ? "calibradas" : "en calibración"}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">Preguntas defectuosas</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {overview.defective.map((d) => (
              <li key={`${d.itemSetId}#${d.questionId}`} className="flex justify-between gap-2">
                <Link href={`/admin/examenes/${d.itemSetId}`} className="hover:underline">
                  {EXAMS[d.exam].name} · pregunta {d.questionId}
                </Link>
                <span className="tabular-nums text-muted-foreground">
                  n={d.n} · {pct(d.pCorrect)} · disc. {d.discrimination?.toFixed(2) ?? "—"}
                </span>
              </li>
            ))}
            {!overview.defective.length && <li className="text-muted-foreground">Ninguna.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
