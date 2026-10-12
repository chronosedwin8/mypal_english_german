import { Suspense } from "react";

import { TutorRoom } from "@/components/call/tutor-room";
import { Skeleton } from "@/components/ui/skeleton";
import { isLanguageCode, type LanguageCode } from "@/lib/site";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";

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
