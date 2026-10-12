import { CameraIcon, MessagesSquareIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AvatarLoop } from "@/components/avatar-loop";
import { Flag, FLAG_BY_LANGUAGE } from "@/components/flag";
import { Skeleton } from "@/components/ui/skeleton";
import { LANGUAGES, LANGUAGE_CODES, isLanguageCode, type LanguageCode } from "@/lib/site";
import { cn } from "@/lib/utils";
import { lessonsFor } from "@/server/app-data";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";

export const metadata = { title: "Practicar" };

export default function PracticePage({ searchParams }: PageProps<"/app/practicar">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
      <Practice searchParams={searchParams} />
    </Suspense>
  );
}

async function Practice({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/app/practicar");
  const sp = await searchParams;
  const profiles = await db.languageProfile.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } });
  const fromQuery = typeof sp.idioma === "string" && isLanguageCode(sp.idioma) ? sp.idioma : null;
  const language: LanguageCode = fromQuery ?? (profiles[0]?.language as LanguageCode | undefined) ?? "EN_US";
  const kids = sp.modo === "ninos";
  const modeQ = kids ? "&modo=ninos" : "";
  const level = kids ? "A1" : (profiles.find((p) => p.language === language)?.level ?? null);
  const modules = await lessonsFor(language, kids ? "KIDS" : "ADULT");
  const order = ["A1", "A2", "B1", "B2", "C1"];
  const sorted = [...modules].sort(
    (a, b) => Math.abs(order.indexOf(a.level) - order.indexOf(level ?? "A2")) - Math.abs(order.indexOf(b.level) - order.indexOf(level ?? "A2")) || a.sortOrder - b.sortOrder,
  );

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      <div>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Practicar</h1>
        <p className="mt-1 text-muted-foreground">Elige con quién practicar y de qué hablar.</p>
      </div>

      <div className="inline-flex rounded-full border bg-card p-1 text-sm font-semibold">
        <Link
          href={`/app/practicar?idioma=${language}`}
          className={cn("rounded-full px-4 py-2", !kids ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          Para mí · con Poly
        </Link>
        <Link
          href={`/app/practicar?idioma=${language}&modo=ninos`}
          className={cn("rounded-full px-4 py-2", kids ? "bg-coral text-white" : "text-muted-foreground hover:text-foreground")}
        >
          🐿️ Para niños · con Nuez
        </Link>
      </div>

      <div role="tablist" className="flex flex-wrap gap-2">
        {LANGUAGE_CODES.map((code) => (
          <Link
            key={code}
            role="tab"
            aria-selected={code === language}
            href={`/app/practicar?idioma=${code}${modeQ}`}
            className={cn(
              "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold",
              code === language ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            <Flag code={FLAG_BY_LANGUAGE[code]} /> {LANGUAGES[code].label}
          </Link>
        ))}
      </div>

      <Link
        href={`/app/clase?idioma=${language}${modeQ}`}
        className={cn(
          "flex items-center gap-5 overflow-hidden rounded-3xl border-2 bg-card p-4 transition-colors hover:bg-secondary/60",
          kids ? "border-coral/50" : "border-primary/40",
        )}
      >
        <span className="relative h-24 w-36 shrink-0 overflow-hidden rounded-2xl sm:h-28 sm:w-48">
          <AvatarLoop who={kids ? "nuez" : "poly"} />
        </span>
        <div>
          <p className="flex items-center gap-2 font-heading text-xl font-bold">
            <MessagesSquareIcon className="size-5" /> {kids ? "Jugar con Nuez" : "Conversación libre con Poly"}
          </p>
          <p className="text-sm text-muted-foreground">
            {kids
              ? "Veo veo, colores, animales y canciones. Un adulto debe acompañar al niño."
              : `Habla de lo que quieras. Poly se adapta a tu nivel${level ? ` (${level})` : ""}.`}
          </p>
        </div>
      </Link>

      <div className="space-y-6">
        {sorted.map((m) => (
          <section key={m.id}>
            <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
              <span aria-hidden="true">{m.emoji}</span> {m.titleEs}
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">{m.level}</span>
            </h2>
            <p className="text-sm text-muted-foreground">{m.descriptionEs}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {m.lessons.map((l) => (
                <Link
                  key={l.id}
                  href={`/app/clase?idioma=${language}&leccion=${l.id}${modeQ}`}
                  className="rounded-2xl border bg-card p-4 transition-transform hover:-translate-y-0.5 hover:shadow-md"
                >
                  <p className="font-semibold">{l.titleEs}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{l.objectives.join(" · ")}</p>
                  <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    ~{l.suggestedMinutes} min
                    {l.usesVision && (
                      <span className="flex items-center gap-1 rounded-full bg-sky/25 px-2 py-0.5 font-medium text-foreground">
                        <CameraIcon className="size-3" /> con visión
                      </span>
                    )}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
