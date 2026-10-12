import { Suspense } from "react";

import { TwoFactorSetup } from "@/components/auth/two-factor-setup";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/dal";

export const metadata = { title: "Seguridad" };

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
  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-16 md:pb-0">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight">Seguridad de tu cuenta</h1>
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
    </div>
  );
}
