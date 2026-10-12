import { ArrowRightIcon, ClockIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PlanCycle, SampleReport } from "@/components/marketing/exams-section";
import { buttonVariants } from "@/components/ui/button";
import { EXAMS } from "@/content/exams";
import { EXAM_SLUGS, examBySlug } from "@/content/exams/slugs";
import { totalItems } from "@/content/exams/types";
import { TASK_TYPE_ES } from "@/lib/exams/labels";
import { cn } from "@/lib/utils";
import { BANK_EXAMS } from "@/server/exams/bank/targets";

export function generateStaticParams() {
  return Object.values(EXAM_SLUGS).map((examen) => ({ examen }));
}

export async function generateMetadata({ params }: PageProps<"/[examen]">): Promise<Metadata> {
  const code = examBySlug((await params).examen);
  if (!code) return {};
  const e = EXAMS[code];
  return {
    title: `Prepárate para ${e.name} con simulacros y tutor IA`,
    description: `${e.purposeEs} Practica con el formato real, simulacros cronometrados y nota estimada en la escala oficial (${e.scaleEs.toLowerCase()}).`,
  };
}

const SECTION_ES: Record<string, string> = { LISTENING: "Comprensión auditiva", READING: "Comprensión de lectura", WRITING: "Expresión escrita", SPEAKING: "Expresión oral" };

export default function ExamPage({ params }: PageProps<"/[examen]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-[60vh] max-w-6xl px-4 py-20" />}>
      <ExamContent params={params} />
    </Suspense>
  );
}

/** Los slugs que no son examenes dan 404 (con Cache Components no existe `dynamicParams`). */
async function ExamContent({ params }: { params: PageProps<"/[examen]">["params"] }) {
  const code = examBySlug((await params).examen);
  if (!code) notFound();
  const e = EXAMS[code];
  const ready = BANK_EXAMS.includes(code);
  const totalMinutes = e.sections.reduce((s, x) => s + x.minutes + (x.reviewMinutes ?? 0), 0);

  return (
    <div className="pb-24">
      <section className="bg-gradient-to-b from-primary/10 to-background">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <p className="font-semibold text-primary">
            {e.language === "en" ? "Inglés" : "Alemán"} · {e.levelEs}
          </p>
          <h1 className="mt-2 max-w-3xl font-heading text-4xl font-extrabold tracking-tight sm:text-6xl">Prepárate para {e.name}</h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">{e.purposeEs}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {ready ? (
              <Link href="/registro" className={cn(buttonVariants(), "h-12 rounded-full px-7 text-base")}>
                Haz una práctica gratis <ArrowRightIcon />
              </Link>
            ) : (
              <span className="rounded-full bg-muted px-4 py-2 text-sm font-semibold">Próximamente</span>
            )}
            <Link href="/#precios" className={cn(buttonVariants({ variant: "outline" }), "h-12 rounded-full px-7 text-base")}>
              Ver precios
            </Link>
          </div>
          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <ClockIcon className="size-4" /> Unos {totalMinutes} minutos · {e.scaleEs}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-heading text-3xl font-extrabold tracking-tight">El formato, parte por parte</h2>
        <p className="mt-2 text-muted-foreground">Practicas exactamente así: mismas partes, mismos tipos de pregunta y mismos tiempos.</p>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {e.sections.map((s) => (
            <div key={s.section} className="rounded-3xl border bg-card p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-heading text-xl font-bold">{s.name}</h3>
                <span className="text-sm text-muted-foreground">
                  {s.minutes} min{totalItems(s) > s.parts.length ? ` · ${totalItems(s)} preguntas` : ""}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{SECTION_ES[s.section]}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {s.parts.map((p) => (
                  <li key={p.part} className="rounded-xl bg-muted/40 px-3 py-2">
                    <b>{p.title}</b> · {p.description}
                    <span className="block text-xs text-muted-foreground">{p.taskTypes.map((t) => TASK_TYPE_ES[t] ?? t.replaceAll("_", " ").toLowerCase()).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-muted/40 py-16">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 lg:grid-cols-2">
          <div>
            <h2 className="font-heading text-3xl font-extrabold tracking-tight">Tu nota en la escala oficial</h2>
            <p className="mt-4 text-muted-foreground">
              {e.scaleEs}. Las secciones de comprensión se califican al instante; la escritura y la expresión oral las califican examinadores virtuales con los
              criterios publicados del examen, con comentarios en español.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">{e.disclaimerEs}</p>
          </div>
          {code === "IELTS_ACADEMIC" && <SampleReport />}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="mb-8 text-center font-heading text-3xl font-extrabold tracking-tight">Un plan que se ajusta a ti</h2>
        <PlanCycle />
      </section>
    </div>
  );
}
