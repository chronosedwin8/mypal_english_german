import { Suspense } from "react";

import { TwoFactorSetup } from "@/components/auth/two-factor-setup";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/dal";
import { recordingCount, retentionDaysFor } from "@/server/exams/recordings";

import { deleteMyRecordingsAction } from "./actions";

export const metadata = { title: "Seguridad y privacidad" };

export default function SecurityPage(props: PageProps<"/app/seguridad">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-3xl" />}>
      <Security searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Security({ searchParams }: { searchParams: PageProps<"/app/seguridad">["searchParams"] }) {
  const user = await requireUser("/app/seguridad");
  const sp = await searchParams;
  const [recordings, retention] = await Promise.all([recordingCount(user.id), retentionDaysFor([user.id])]);
  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-16 md:pb-0">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight">Seguridad y privacidad</h1>
      {typeof sp.aviso === "string" && <p className="rounded-2xl border bg-card px-4 py-3 text-sm">{sp.aviso}</p>}
      {sp.motivo === "admin" && (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          Para entrar al panel de administración necesitas activar el segundo factor de autenticación.
        </p>
      )}
      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-heading text-lg font-bold">Segundo factor (código de una app)</h2>
        <div className="mt-4">
          <TwoFactorSetup enabled={user.twoFactorEnabled} />
        </div>
      </section>
      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-heading text-lg font-bold">Tus grabaciones de Speaking</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Guardamos el audio de tus respuestas {retention.get(user.id)} días para que tú (y tu docente, si estudias con una institución) puedan escucharlo. Después se
          borra solo. La transcripción y la nota se conservan.
        </p>
        <form action={deleteMyRecordingsAction} className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" disabled={!recordings}>
            Borrar mis grabaciones ahora
          </Button>
          <span className="text-sm text-muted-foreground">{recordings ? `${recordings} prácticas con audio guardado` : "No hay audios guardados."}</span>
        </form>
      </section>
    </div>
  );
}
