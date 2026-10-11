import { ArrowRightIcon, BookOpenIcon, ClipboardCheckIcon, FlameIcon, GiftIcon, VideoIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Flag, FLAG_BY_LANGUAGE } from "@/components/flag";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMinutes } from "@/lib/pricing/catalog";
import { CEFR_LABELS, LANGUAGES } from "@/lib/site";
import { cn } from "@/lib/utils";
import { accountSummary, dueVocabularyCount, recentSessions } from "@/server/app-data";
import { requireUser } from "@/server/auth/dal";

export const metadata = { title: "Inicio" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-48 rounded-3xl md:col-span-2" />
        <Skeleton className="h-48 rounded-3xl" />
      </div>
    </div>
  );
}

async function Dashboard() {
  const user = await requireUser("/app");
  const [acc, recent, due] = await Promise.all([accountSummary(user.id), recentSessions(user.id), dueVocabularyCount(user.id)]);
  const firstName = user.name.split(" ")[0];
  const paidMin = Math.floor(acc.balance.paidAvailableSeconds / 60);
  const mainProfile = acc.profiles[0];

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      <div>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">¡Hola, {firstName}! 👋</h1>
        <p className="mt-1 text-muted-foreground">¿Listo para conversar hoy?</p>
      </div>

      {acc.openSession && (
        <Link
          href={`/app/clase?reanudar=${acc.openSession.id}`}
          className="flex items-center justify-between rounded-2xl border-2 border-coral bg-coral/10 p-4 font-semibold"
        >
          Tienes una clase en curso. Volver a la clase <ArrowRightIcon />
        </Link>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Accion principal */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[oklch(0.5_0.22_310)] to-coral p-7 text-primary-foreground shadow-xl md:col-span-2">
          <div className="absolute -right-10 -top-10 size-44 rounded-full bg-sun/30 blur-2xl" />
          {acc.needsDiagnosticForTrial && acc.trialAvailable && paidMin === 0 ? (
            <>
              <ClipboardCheckIcon className="size-8" />
              <h2 className="mt-3 font-heading text-2xl font-bold">Primero, tu test de nivel gratis</h2>
              <p className="mt-1 max-w-md opacity-90">
                Unos 8 minutos. Así tu tutora sabrá cómo hablarte, y después tendrás tu clase gratis de {Math.round(acc.trialSeconds / 60)} minutos.
              </p>
              <Link href="/test-de-nivel" className={cn(buttonVariants({ variant: "secondary" }), "mt-5 h-11 rounded-full bg-white px-5 text-primary hover:bg-white/90")}>
                Hacer el test <ArrowRightIcon />
              </Link>
            </>
          ) : acc.trialAvailable && paidMin === 0 ? (
            <>
              <GiftIcon className="size-8" />
              <h2 className="mt-3 font-heading text-2xl font-bold">Tu clase gratis te espera</h2>
              <p className="mt-1 max-w-md opacity-90">
                {Math.round(acc.trialSeconds / 60)} minutos por video con tu tutora. Muéstrale algo de tu cuarto y pregúntale cómo se dice.
              </p>
              <Link href="/app/practicar" className={cn(buttonVariants({ variant: "secondary" }), "mt-5 h-11 rounded-full bg-white px-5 text-primary hover:bg-white/90")}>
                Usar mi clase gratis <ArrowRightIcon />
              </Link>
            </>
          ) : paidMin > 0 ? (
            <>
              <VideoIcon className="size-8" />
              <h2 className="mt-3 font-heading text-2xl font-bold">Tienes {formatMinutes(acc.balance.paidAvailableSeconds)} con tu tutora</h2>
              <p className="mt-1 max-w-md opacity-90">Elige un tema o conversa libremente. Tu tutora recuerda lo que hablaron.</p>
              <Link href="/app/practicar" className={cn(buttonVariants({ variant: "secondary" }), "mt-5 h-11 rounded-full bg-white px-5 text-primary hover:bg-white/90")}>
                Practicar ahora <ArrowRightIcon />
              </Link>
            </>
          ) : (
            <>
              <VideoIcon className="size-8" />
              <h2 className="mt-3 font-heading text-2xl font-bold">Sigue practicando con tu tutora</h2>
              <p className="mt-1 max-w-md opacity-90">
                {acc.subscription ? "Se te acabaron los minutos de este mes. Recarga para seguir." : "Elige un plan y conversa cuando quieras."}
              </p>
              <Link href="/app/planes" className={cn(buttonVariants({ variant: "secondary" }), "mt-5 h-11 rounded-full bg-white px-5 text-primary hover:bg-white/90")}>
                {acc.subscription ? "Recargar minutos" : "Ver planes"} <ArrowRightIcon />
              </Link>
            </>
          )}
        </section>

        {/* Mi progreso */}
        <section className="rounded-3xl border bg-card p-6">
          <h2 className="font-semibold">Mi progreso</h2>
          {mainProfile ? (
            <div className="mt-4 space-y-4">
              {acc.profiles.map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Flag code={FLAG_BY_LANGUAGE[p.language]} /> {LANGUAGES[p.language].label}
                  </span>
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground">
                    {p.level ? CEFR_LABELS[p.level].split(" · ")[0] : "—"}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3">
                <FlameIcon className="size-6 text-coral" />
                <div>
                  <p className="font-heading text-xl font-bold">{mainProfile.streakDays} {mainProfile.streakDays === 1 ? "día" : "días"}</p>
                  <p className="text-xs text-muted-foreground">de racha · {mainProfile.xp} XP</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Haz el <Link href="/test-de-nivel" className="font-semibold text-primary hover:underline">test de nivel</Link> para empezar.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Link href="/app/vocabulario" className="flex items-center gap-4 rounded-3xl border bg-card p-6 transition-colors hover:bg-muted/50">
          <span className="grid size-12 place-items-center rounded-2xl bg-mint/25">
            <BookOpenIcon className="size-6" />
          </span>
          <div className="flex-1">
            <p className="font-semibold">Repasar vocabulario</p>
            <p className="text-sm text-muted-foreground">
              {due ? `${due} ${due === 1 ? "palabra lista" : "palabras listas"} para repasar` : "Al día. ¡Bien!"}
            </p>
          </div>
          <ArrowRightIcon className="text-muted-foreground" />
        </Link>
        <div className="rounded-3xl border bg-card p-6">
          <p className="font-semibold">Clases recientes</p>
          {recent.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link href={`/app/clase/${s.id}/resumen`} className="flex items-center justify-between rounded-xl px-2 py-1.5 hover:bg-muted">
                    <span className="flex items-center gap-2">
                      <Flag code={FLAG_BY_LANGUAGE[s.language]} />
                      {new Date(s.createdAt).toLocaleDateString("es", { day: "numeric", month: "short" })}
                      {s.isTrial && <span className="rounded bg-sun/40 px-1.5 text-[10px] font-bold">GRATIS</span>}
                    </span>
                    <span className="text-muted-foreground">{Math.ceil((s.chargedSeconds ?? 0) / 60)} min</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Aún no tienes clases. ¡La primera es la mejor!</p>
          )}
        </div>
      </div>
    </div>
  );
}
