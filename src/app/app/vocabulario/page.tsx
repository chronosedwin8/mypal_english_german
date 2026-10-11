import { Suspense } from "react";

import { Flag, FLAG_BY_LANGUAGE } from "@/components/flag";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";

import { ReviewDeck } from "./review-deck";

export const metadata = { title: "Vocabulario" };

export default function VocabularyPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
      <Vocabulary />
    </Suspense>
  );
}

async function Vocabulary() {
  const user = await requireUser("/app/vocabulario");
  const [due, all] = await Promise.all([
    db.vocabularyItem.findMany({ where: { userId: user.id, dueAt: { lte: new Date() } }, orderBy: { dueAt: "asc" }, take: 20 }),
    db.vocabularyItem.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return (
    <div className="space-y-8 pb-16 md:pb-0">
      <div>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Mi vocabulario</h1>
        <p className="mt-1 text-muted-foreground">
          Las palabras que aprendes con tu tutora se guardan aquí. Repásalas unos minutos al día: es gratis.
        </p>
      </div>
      <ReviewDeck
        items={due.map((v) => ({ id: v.id, term: v.term, translationEs: v.translationEs, example: v.example, language: v.language }))}
      />
      <section>
        <h2 className="font-heading text-xl font-bold">Todas mis palabras ({all.length})</h2>
        {all.length ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {all.map((v) => (
              <li key={v.id} className="rounded-2xl border bg-card px-4 py-3">
                <p className="flex items-center gap-2 font-semibold">
                  <Flag code={FLAG_BY_LANGUAGE[v.language]} /> {v.term}
                </p>
                {v.translationEs && <p className="text-sm text-muted-foreground">{v.translationEs}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Aún no tienes palabras. En tu próxima clase, muéstrale un objeto a tu tutora y pregúntale cómo se dice.
          </p>
        )}
      </section>
    </div>
  );
}
