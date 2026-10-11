import { ArrowRightIcon, CheckCircle2Icon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/app/auto-refresh";
import { Flag, FLAG_BY_LANGUAGE } from "@/components/flag";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LANGUAGES } from "@/lib/site";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { getBalance } from "@/server/ledger/wallet";

export const metadata = { title: "Resumen de tu clase" };

export default function SummaryPage({ params }: PageProps<"/app/clase/[id]/resumen">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
      <Summary params={params} />
    </Suspense>
  );
}

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m} min ${s ? `${s} s` : ""}`.trim() : `${s} s`;
}

async function Summary({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const session = await db.tutorSession.findFirst({
    where: { id, userId: user.id },
    include: { transcript: true, corrections: { orderBy: { createdAt: "asc" } } },
  });
  if (!session) notFound();
  const vocab = await db.vocabularyItem.findMany({ where: { sessionId: id }, orderBy: { createdAt: "asc" } });
  const settled = session.status === "SETTLED" || session.status === "FAILED";

  if (!settled) {
    return (
      <div className="pt-16 text-center">
        <AutoRefresh everyMs={3000} />
        <p className="font-heading text-2xl font-bold">Cerrando tu clase…</p>
        <p className="mt-2 text-muted-foreground">Estamos confirmando el tiempo exacto con tu tutora. Esto toma unos segundos.</p>
      </div>
    );
  }

  const balance = await getBalance(user.id);
  const turns = (session.transcript?.turns ?? []) as { role?: string; content?: string }[];
  const visibleTurns = turns.filter((t) => (t.role === "user" || t.role === "assistant") && t.content?.trim());

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      <div className="rounded-3xl bg-gradient-to-br from-primary via-[oklch(0.5_0.22_310)] to-coral p-7 text-primary-foreground shadow-xl">
        <p className="flex items-center gap-2 text-sm opacity-90">
          <Flag code={FLAG_BY_LANGUAGE[session.language]} /> {LANGUAGES[session.language].label}
          {session.isTrial && " · clase gratis"}
        </p>
        <h1 className="mt-2 font-heading text-3xl font-extrabold">¡Buen trabajo! 🎉</h1>
        <p className="mt-1 opacity-90">
          {session.status === "FAILED" || !session.joinedAt
            ? "La clase no llegó a empezar. No se descontó ningún minuto."
            : `Conversaste ${fmt(session.chargedSeconds ?? 0)} con tu tutora.`}
        </p>
      </div>

      {session.isTrial && balance.paidAvailableSeconds === 0 && (
        <section className="rounded-3xl border-2 border-primary/40 bg-card p-6 sm:p-8">
          <h2 className="flex items-center gap-2 font-heading text-2xl font-bold">
            <SparklesIcon className="text-primary" /> ¿Te gustó? Sigue practicando
          </h2>
          <p className="mt-1 text-muted-foreground">Elige tu plan y conversa con tu tutora cuando quieras.</p>
          <div className="mt-8">
            <PricingCards ctaHref="/app/planes" />
          </div>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border bg-card p-6">
          <h2 className="font-semibold">📌 Palabras nuevas</h2>
          {vocab.length ? (
            <ul className="mt-3 space-y-2">
              {vocab.map((v) => (
                <li key={v.id} className="rounded-xl bg-muted/50 px-3 py-2">
                  <span className="font-semibold">{v.term}</span>
                  {v.translationEs && <span className="text-muted-foreground"> · {v.translationEs}</span>}
                  {v.example && <p className="text-sm italic text-muted-foreground">“{v.example}”</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Esta vez no se guardaron palabras nuevas.</p>
          )}
        </section>
        <section className="rounded-3xl border bg-card p-6">
          <h2 className="font-semibold">✍️ Correcciones</h2>
          {session.corrections.length ? (
            <ul className="mt-3 space-y-3">
              {session.corrections.map((c) => (
                <li key={c.id} className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
                  <p className="text-muted-foreground line-through">{c.original}</p>
                  <p className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2Icon className="size-4 text-mint" /> {c.corrected}
                  </p>
                  {c.explanation && <p className="mt-1 text-muted-foreground">{c.explanation}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Sin correcciones importantes. ¡Muy bien!</p>
          )}
        </section>
      </div>

      {visibleTurns.length > 0 && (
        <section className="rounded-3xl border bg-card p-6">
          <h2 className="font-semibold">Transcripción</h2>
          <ol className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-2 text-sm">
            {visibleTurns.map((t, i) => (
              <li key={i} className={cn("max-w-[85%] rounded-2xl px-3 py-2", t.role === "user" ? "ml-auto bg-primary/10" : "bg-muted")}>
                <span className="block text-[10px] font-bold uppercase text-muted-foreground">{t.role === "user" ? "Tú" : "Tutora"}</span>
                {t.content}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/app/practicar" className={cn(buttonVariants(), "h-11 rounded-full px-5")}>
          Otra clase <ArrowRightIcon />
        </Link>
        <Link href="/app/vocabulario" className={cn(buttonVariants({ variant: "outline" }), "h-11 rounded-full px-5")}>
          Repasar vocabulario
        </Link>
      </div>
    </div>
  );
}
