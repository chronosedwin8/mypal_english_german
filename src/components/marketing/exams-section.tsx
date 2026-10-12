import { ArrowRightIcon, ClockIcon, FileTextIcon, HeadphonesIcon, MicIcon, PenLineIcon, RefreshCwIcon, TargetIcon, TrendingUpIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { EXAMS, EXAM_CODES } from "@/content/exams";
import { EXAM_SLUGS } from "@/content/exams/slugs";
import { cn } from "@/lib/utils";
import { BANK_EXAMS } from "@/server/exams/bank/targets";

/** Examenes cuyo banco ya esta activo (el resto se anuncia como "Proximamente"). */
const READY = new Set<string>(BANK_EXAMS);

export function ExamCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {EXAM_CODES.map((code) => {
        const e = EXAMS[code];
        const ready = READY.has(code);
        return (
          <Link
            key={code}
            href={`/${EXAM_SLUGS[code]}`}
            className="group flex flex-col rounded-3xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-primary">{e.language === "en" ? "Inglés" : "Alemán"}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", ready ? "bg-mint/25 text-emerald-800 dark:text-emerald-200" : "bg-muted text-muted-foreground")}>
                {ready ? "Disponible" : "Próximamente"}
              </span>
            </div>
            <p className="mt-3 font-heading text-lg font-bold leading-tight">{e.name}</p>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">{e.purposeEs}</p>
            <p className="mt-3 text-xs font-medium">{e.scaleEs}</p>
            <span className="mt-3 flex items-center gap-1 text-sm font-semibold text-primary">
              Ver el examen <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** Informe de ejemplo de un simulacro (datos ilustrativos). */
export function SampleReport() {
  const bands = [
    { label: "Listening", value: 7.0, icon: HeadphonesIcon, detail: "31/40" },
    { label: "Reading", value: 6.5, icon: FileTextIcon, detail: "27/40" },
    { label: "Writing", value: 6.0, icon: PenLineIcon, detail: "T1 6 · T2 6" },
    { label: "Speaking", value: 6.5, icon: MicIcon, detail: "fluidez 7 · gramática 6" },
  ];
  return (
    <div className="relative rounded-3xl border bg-card p-6 shadow-xl">
      <span className="absolute -top-3 right-6 rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">Informe de ejemplo</span>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Banda general estimada</p>
          <p className="font-heading text-6xl font-extrabold">6.5</p>
          <p className="text-sm">MCER B2 · meta 7.0</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>IELTS Academic</p>
          <p>Simulacro completo</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {bands.map((b) => (
          <div key={b.label} className="rounded-2xl bg-muted/50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <b.icon className="size-3.5" /> {b.label}
            </p>
            <p className="font-heading text-2xl font-extrabold">{b.value.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">{b.detail}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border border-dashed p-3 text-sm">
        <p className="font-semibold">Para subir a 7.0</p>
        <p className="text-muted-foreground">True/False/Not Given: 4 de 9. Subirlo al 75 % suma unos 3 aciertos en Reading, media banda.</p>
      </div>
    </div>
  );
}

const CYCLE = [
  { icon: ClockIcon, title: "Simulacro", text: "El examen entero con reloj real y nota en la escala oficial." },
  { icon: TargetIcon, title: "Informe", text: "Tus fortalezas y lo que más subiría tu nota, primero." },
  { icon: RefreshCwIcon, title: "Plan de mejora", text: "Tareas concretas que entran solas a tu plan semanal." },
  { icon: TrendingUpIcon, title: "Práctica dirigida", text: "Tipos de pregunta débiles, Writing, Speaking y tu tutor." },
];

export function PlanCycle() {
  return (
    <ol className="grid gap-4 md:grid-cols-4">
      {CYCLE.map((c, i) => (
        <li key={c.title} className="relative rounded-3xl border bg-card p-6">
          <span className="absolute right-5 top-4 font-heading text-4xl font-extrabold text-muted">{i + 1}</span>
          <c.icon className="size-6 text-primary" />
          <p className="mt-3 font-heading text-lg font-bold">{c.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{c.text}</p>
        </li>
      ))}
    </ol>
  );
}

export function ExamsSection() {
  return (
    <section id="examenes" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl space-y-20 px-4">
        <div>
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="font-semibold text-primary">Prepárate para tu examen</p>
            <h2 className="mt-2 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">IELTS, Goethe y TestDaF, con el formato real</h2>
            <p className="mt-4 text-muted-foreground">Mismo formato, mismos tiempos y la misma escala del examen. Practica cada tipo de pregunta con explicaciones en español.</p>
          </div>
          <ExamCards />
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="font-semibold text-primary">Simulacros como el día del examen</p>
            <h3 className="mt-2 font-heading text-3xl font-extrabold tracking-tight">Reloj real, audio que suena una sola vez y nota oficial estimada</h3>
            <p className="mt-4 text-muted-foreground">
              Listening, Reading, Writing y Speaking en orden, sin volver atrás. Al final recibes un informe con tu banda por sección, tu banda general y
              qué practicar para llegar a tu meta.
            </p>
            <Link href="/registro" className={cn(buttonVariants(), "mt-6 rounded-full")}>
              Haz una práctica gratis <ArrowRightIcon />
            </Link>
          </div>
          <SampleReport />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border bg-card p-7">
            <PenLineIcon className="size-7 text-primary" />
            <h3 className="mt-4 font-heading text-2xl font-bold">Writing con respuesta inmediata</h3>
            <p className="mt-2 text-muted-foreground">
              Dos examinadores virtuales califican cada criterio, marcan tus errores y te muestran tu texto una banda más arriba.
            </p>
            <div className="mt-5 space-y-2 rounded-2xl bg-muted/50 p-4 text-sm">
              <p>
                <s className="text-rose-600">This save time</s> → <b className="text-emerald-700 dark:text-emerald-300">This saves time</b>
              </p>
              <p className="text-muted-foreground">El sujeto “this” es singular: el verbo lleva -s.</p>
            </div>
          </div>
          <div className="rounded-3xl border bg-card p-7">
            <MicIcon className="size-7 text-primary" />
            <h3 className="mt-4 font-heading text-2xl font-bold">Speaking con examinador por voz</h3>
            <p className="mt-2 text-muted-foreground">
              Las tres partes del examen: entrevista, tarjeta con un minuto para preparar y discusión. Nota de fluidez, vocabulario, gramática y
              pronunciación.
            </p>
            <div className="mt-5 rounded-2xl bg-muted/50 p-4 text-sm">
              <p className="font-semibold">Describe a useful skill you learned.</p>
              <p className="text-muted-foreground">You should say: what it is · how you learned it · when you use it…</p>
            </div>
          </div>
        </div>

        <div>
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="font-semibold text-primary">Tu plan se ajusta solo</p>
            <h3 className="mt-2 font-heading text-3xl font-extrabold tracking-tight">Cada simulacro mejora tu plan de estudios</h3>
            <p className="mt-4 text-muted-foreground">Dinos tu meta y tu fecha: armamos tus semanas y las recalculamos con cada práctica.</p>
          </div>
          <PlanCycle />
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Preparación independiente. No estamos afiliados a IELTS (British Council, IDP, Cambridge), al Goethe-Institut ni a TestDaF. Las notas son
          estimaciones, no resultados oficiales.
        </p>
      </div>
    </section>
  );
}
