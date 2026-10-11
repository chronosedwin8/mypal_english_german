import { ArrowRightIcon, VideoIcon } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Flag, FLAG_BY_LANGUAGE } from "@/components/flag";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LANGUAGES } from "@/lib/site";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth/dal";
import { DiagnosticError, getResult } from "@/server/diagnostic/service";
import { ANON_COOKIE } from "@/server/security";

export const metadata: Metadata = { title: "Tu resultado" };

const CAN_DO: Record<string, { title: string; text: string }> = {
  A1: { title: "Principiante", text: "Entiendes y usas frases muy básicas para presentarte y pedir cosas sencillas." },
  A2: { title: "Básico", text: "Te comunicas en situaciones cotidianas: compras, direcciones, hablar de tu rutina." },
  B1: { title: "Intermedio", text: "Te defiendes en viajes, cuentas experiencias y das opiniones con frases simples." },
  B2: { title: "Intermedio alto", text: "Conversas con fluidez y naturalidad con hablantes nativos sobre muchos temas." },
  C1: { title: "Avanzado", text: "Te expresas con soltura y precisión, incluso en contextos profesionales y académicos." },
};

const SKILLS: [string, string][] = [
  ["GRAMMAR", "Gramática"],
  ["VOCAB", "Vocabulario"],
  ["READING", "Lectura"],
  ["LISTENING", "Escucha"],
  ["SPEAKING", "Expresión oral"],
];

export default function ResultPage({ params }: PageProps<"/test-de-nivel/resultado/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="mt-8 h-96 w-full rounded-3xl" />}>
      <Result params={params} />
    </Suspense>
  );
}

async function Result({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, jar] = await Promise.all([getCurrentUser(), cookies()]);
  let attempt;
  try {
    attempt = await getResult(id, { userId: user?.id ?? null, anonId: jar.get(ANON_COOKIE)?.value ?? null });
  } catch (e) {
    if (e instanceof DiagnosticError) notFound();
    throw e;
  }
  if (attempt.status !== "COMPLETED" || !attempt.resultLevel) {
    return (
      <div className="pt-10 text-center">
        <p className="text-muted-foreground">Este test aún no termina.</p>
        <Link href="/test-de-nivel" className={cn(buttonVariants(), "mt-4 rounded-full")}>
          Continuar el test
        </Link>
      </div>
    );
  }

  const level = attempt.resultLevel;
  const lang = LANGUAGES[attempt.language];
  const scores = (attempt.skillScores ?? {}) as Record<string, number>;
  const info = CAN_DO[level] ?? CAN_DO.A1;

  return (
    <div className="pt-6">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary via-[oklch(0.5_0.22_310)] to-coral p-8 text-primary-foreground shadow-2xl sm:p-10">
        <div className="absolute -right-12 -top-12 size-56 rounded-full bg-sun/30 blur-3xl" />
        <p className="flex items-center gap-2 text-sm font-medium opacity-90">
          <Flag code={FLAG_BY_LANGUAGE[attempt.language]} /> {lang.label} · tu nivel estimado
        </p>
        <p className="mt-3 font-heading text-7xl font-extrabold tracking-tight sm:text-8xl">{level}</p>
        <p className="mt-1 font-heading text-2xl font-bold">{info.title}</p>
        <p className="mt-3 max-w-lg text-lg opacity-90">{info.text}</p>
      </div>

      <section className="mt-8 rounded-3xl border bg-card p-6 sm:p-8">
        <h2 className="font-heading text-xl font-bold">Tu resultado por habilidad</h2>
        <ul className="mt-5 space-y-4">
          {SKILLS.filter(([k]) => scores[k] !== undefined).map(([k, label]) => {
            const pct = Math.round((scores[k] ?? 0) * 100);
            return (
              <li key={k}>
                <div className="flex justify-between text-sm font-medium">
                  <span>{label}</span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-coral" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-5 text-xs text-muted-foreground">
          Es una estimación orientativa para que tu tutor empiece a tu ritmo. No reemplaza un examen oficial.
        </p>
      </section>

      <section className="mt-8 flex flex-col items-start gap-4 rounded-3xl border-2 border-primary/30 bg-secondary/50 p-6 sm:flex-row sm:items-center sm:p-8">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <VideoIcon className="size-7" />
        </span>
        <div className="flex-1">
          <p className="font-heading text-xl font-bold">Ahora, habla 5 minutos gratis con tu tutor</p>
          <p className="text-muted-foreground">Ya sabe tu nivel: empezará la conversación justo donde estás.</p>
        </div>
        {user ? (
          <Link href="/app/practicar" className={cn(buttonVariants(), "h-12 rounded-full px-6 text-base")}>
            Ir a mi clase gratis <ArrowRightIcon />
          </Link>
        ) : (
          <Link href="/registro" className={cn(buttonVariants(), "h-12 rounded-full px-6 text-base")}>
            Crear cuenta gratis <ArrowRightIcon />
          </Link>
        )}
      </section>
    </div>
  );
}
