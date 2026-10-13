import Link from "next/link";
import { Suspense } from "react";

import { TutorRoom } from "@/components/call/tutor-room";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isLanguageCode, type LanguageCode } from "@/lib/site";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { classBlocker } from "@/server/trial/readiness";

export const metadata = { title: "Clase con tu tutora" };

export default function ClassPage({ searchParams }: PageProps<"/app/clase">) {
  return (
    <Suspense fallback={<Skeleton className="aspect-video w-full rounded-3xl" />}>
      <Room searchParams={searchParams} />
    </Suspense>
  );
}

async function Room({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/app/clase");
  const sp = await searchParams;
  const open = await db.tutorSession.findFirst({
    where: { userId: user.id, status: { in: ["READY", "LIVE"] } },
    select: { id: true, language: true, lessonId: true, audience: true },
  });
  const audience = open?.audience ?? (sp.modo === "ninos" ? "KIDS" : "ADULT");
  const language: LanguageCode =
    (open?.language as LanguageCode | undefined) ?? (typeof sp.idioma === "string" && isLanguageCode(sp.idioma) ? sp.idioma : "EN_US");
  const lessonId = open?.lessonId ?? (typeof sp.leccion === "string" ? sp.leccion : null);
  const lesson = lessonId ? await db.lesson.findUnique({ where: { id: lessonId }, select: { id: true, titleEs: true } }) : null;
  // Sin clase abierta: si algo impide empezar, se dice antes de pedir camara y microfono.
  const blocker = open ? null : await classBlocker(user);
  if (blocker)
    return (
      <div className="mx-auto max-w-xl rounded-3xl border bg-card p-8 text-center">
        <h1 className="font-heading text-2xl font-extrabold">{blocker.title}</h1>
        <p className="mt-3 text-muted-foreground">{blocker.message}</p>
        <Link href={blocker.cta.href} className={buttonVariants({ size: "lg", className: "mt-6 rounded-full" })}>
          {blocker.cta.label}
        </Link>
      </div>
    );

  return (
    <div className="pb-16 md:pb-0">
      <TutorRoom
        language={language}
        audience={audience}
        lessonId={lesson?.id ?? null}
        lessonTitle={lesson?.titleEs ?? null}
        userName={user.name.split(" ")[0]}
        resumeSessionId={open?.id ?? null}
      />
    </div>
  );
}
