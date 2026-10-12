import { FlameIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { TASK_TYPE_ES } from "@/lib/exams/labels";
import { requireUser } from "@/server/auth/dal";
import { progressData } from "@/server/study/plan";

import { officialResultAction } from "../actions";

export const metadata = { title: "Mi progreso" };

const EXAM = "IELTS_ACADEMIC" as const;
const COLORS: Record<string, string> = { LISTENING: "#1f6feb", READING: "#2f9e44", WRITING: "#e8590c", SPEAKING: "#ae3ec9", OVERALL: "#6d28d9" };
const LABELS: Record<string, string> = { LISTENING: "Listening", READING: "Reading", WRITING: "Writing", SPEAKING: "Speaking", OVERALL: "Simulacro (general)" };
const CRITERIA: Record<string, string> = {
  "writing:TA": "Writing · tarea",
  "writing:CC": "Writing · coherencia",
  "writing:LR": "Writing · vocabulario",
  "writing:GRA": "Writing · gramática",
  "speaking:FC": "Speaking · fluidez",
  "speaking:LR": "Speaking · vocabulario",
  "speaking:GRA": "Speaking · gramática",
  "speaking:P": "Speaking · pronunciación",
};

/** 75 → "1 h 15 min"; 15 → "15 min". */
function hm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

export default function ProgressPage(props: PageProps<"/app/examenes/progreso">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
      <ProgressView searchParams={props.searchParams} />
    </Suspense>
  );
}

function BandChart({ points, target }: { points: { date: string; section: string; band: number }[]; target: number | null }) {
  const W = 720;
  const H = 260;
  const pad = { l: 36, r: 12, t: 12, b: 28 };
  const lo = 3;
  const hi = 9;
  const n = Math.max(points.length, 2);
  const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (b: number) => pad.t + ((hi - Math.max(lo, Math.min(hi, b))) / (hi - lo)) * (H - pad.t - pad.b);
  const series = Object.keys(COLORS).map((s) => ({ s, pts: points.map((p, i) => ({ ...p, i })).filter((p) => p.section === s) }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bandas a lo largo del tiempo" className="h-auto w-full">
      {[3, 4, 5, 6, 7, 8, 9].map((b) => (
        <g key={b}>
          <line x1={pad.l} x2={W - pad.r} y1={y(b)} y2={y(b)} stroke="currentColor" strokeOpacity={0.1} />
          <text x={pad.l - 8} y={y(b) + 4} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity={0.6}>
            {b}
          </text>
        </g>
      ))}
      {target !== null && <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="#6d28d9" strokeDasharray="6 4" strokeWidth={1.5} />}
      {series.map(({ s, pts }) =>
        pts.length ? (
          <g key={s}>
            <polyline points={pts.map((p) => `${x(p.i)},${y(p.band)}`).join(" ")} fill="none" stroke={COLORS[s]} strokeWidth={2.5} />
            {pts.map((p) => (
              <circle key={p.i} cx={x(p.i)} cy={y(p.band)} r={4} fill={COLORS[s]}>
                <title>{`${LABELS[s]}: ${p.band.toFixed(1)} · ${new Date(p.date).toLocaleDateString("es")}`}</title>
              </circle>
            ))}
          </g>
        ) : null,
      )}
    </svg>
  );
}

async function ProgressView({ searchParams }: { searchParams: PageProps<"/app/examenes/progreso">["searchParams"] }) {
  const user = await requireUser("/app/examenes/progreso");
  const sp = await searchParams;
  const aviso = typeof sp.aviso === "string" ? sp.aviso : null;
  const data = await progressData(user.id, EXAM);
  const tasks = data.mastery.filter((m) => m.key.startsWith("task:")).sort((a, b) => a.value - b.value);
  const criteria = data.mastery.filter((m) => CRITERIA[m.key]);
  const bands = Array.from({ length: 17 }, (_, i) => 1 + i * 0.5);

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      <div>
        <Link href="/app/examenes" className="text-sm text-muted-foreground hover:text-foreground">
          ← Exámenes
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-extrabold tracking-tight">Mi progreso · IELTS</h1>
      </div>
      {aviso && <p className="rounded-2xl border bg-card px-4 py-3 text-sm">{aviso}</p>}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Racha</p>
          <p className="mt-1 flex items-center gap-2 font-heading text-3xl font-extrabold">
            <FlameIcon className="size-7 text-orange-500" /> {data.streak} {data.streak === 1 ? "día" : "días"}
          </p>
        </div>
        <div className="rounded-3xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Estudio hecho frente a lo planeado</p>
          <p className="mt-1 font-heading text-3xl font-extrabold tabular-nums">
            {hm(data.doneMinutes)} <span className="text-lg text-muted-foreground">/ {hm(data.plannedMinutes)}</span>
          </p>
          <Progress value={data.plannedMinutes ? (data.doneMinutes / data.plannedMinutes) * 100 : 0} className="mt-2 h-1.5" />
        </div>
        <div className="rounded-3xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Preguntas sin responder</p>
          <p className="mt-1 font-heading text-3xl font-extrabold tabular-nums">{Math.round(data.unansweredRate * 100)} %</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.unansweredRate > 0.1 ? "Parece un tema de tiempo: practica secciones cronometradas." : "Buen manejo del tiempo."}</p>
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-6">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="mr-auto font-heading text-xl font-bold">Tu nota estimada en el tiempo</h2>
          {Object.entries(LABELS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5 text-xs">
              <span className="size-2.5 rounded-full" style={{ background: COLORS[k] }} /> {v}
            </span>
          ))}
        </div>
        {data.points.length ? (
          <div className="mt-4 text-foreground">
            <BandChart points={data.points} target={data.target} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Cuando completes secciones cronometradas, Writing, Speaking o simulacros, verás aquí tu evolución frente a tu meta.</p>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Dominio por tipo de pregunta</h2>
          {tasks.length ? (
            <ul className="mt-4 space-y-3">
              {tasks.map((m) => (
                <li key={m.key}>
                  <div className="flex justify-between text-sm">
                    <span>{TASK_TYPE_ES[m.key.slice(5)] ?? m.key.slice(5)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {Math.round(m.value * 100)} % · {m.n}
                    </span>
                  </div>
                  <Progress value={m.value * 100} className="mt-1 h-1.5" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Aún no hay práctica de Listening o Reading.</p>
          )}
        </div>
        <div className="rounded-3xl border bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Criterios de Writing y Speaking</h2>
          {criteria.length ? (
            <ul className="mt-4 space-y-3">
              {criteria.map((m) => (
                <li key={m.key}>
                  <div className="flex justify-between text-sm">
                    <span>{CRITERIA[m.key]}</span>
                    <span className="font-semibold tabular-nums">{m.value.toFixed(1)}</span>
                  </div>
                  <Progress value={(m.value / 9) * 100} className="mt-1 h-1.5" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Aparecerán cuando califiquemos tu primer Writing o Speaking.</p>
          )}
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-heading text-lg font-bold">Simulacros</h2>
        {data.mocks.length ? (
          <ul className="mt-3 divide-y">
            {data.mocks.map((m) => (
              <li key={m.id}>
                <Link href={`/app/examenes/simulacro/${m.id}`} className="flex justify-between py-2.5 text-sm hover:underline">
                  <span>{m.completedAt!.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}</span>
                  <span className="font-semibold tabular-nums">{m.overall !== null ? `banda ${m.overall.toFixed(1)}` : "sin banda general"}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Todavía no has hecho un simulacro completo.</p>
        )}
      </section>

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-heading text-lg font-bold">¿Ya presentaste el examen oficial?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Cuéntanos tu nota: la comparamos con nuestras estimaciones para que el simulador sea cada vez más preciso.</p>
        <form action={officialResultAction} className="mt-4 grid gap-3 sm:grid-cols-6">
          <input type="hidden" name="exam" value={EXAM} />
          <label className="space-y-1 text-xs font-medium sm:col-span-1">
            Fecha
            <input type="date" name="takenAt" required className="h-9 w-full rounded-lg border bg-background px-2 text-sm" />
          </label>
          {(["overall", "listening", "reading", "writing", "speaking"] as const).map((k) => (
            <label key={k} className="space-y-1 text-xs font-medium">
              {k === "overall" ? "General" : k.charAt(0).toUpperCase() + k.slice(1)}
              <select name={k} defaultValue="6.5" className="h-9 w-full rounded-lg border bg-background px-2 text-sm">
                {bands.map((b) => (
                  <option key={b} value={b}>
                    {b.toFixed(1)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="sm:col-span-6">
            <Button type="submit" variant="outline">
              Guardar mi nota oficial
            </Button>
          </div>
        </form>
        {data.official.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {data.official.map((o) => (
              <li key={o.id} className="text-muted-foreground">
                {o.takenAt.toLocaleDateString("es")}: general <b className="text-foreground">{(o.scores as { overall: number }).overall.toFixed(1)}</b>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
