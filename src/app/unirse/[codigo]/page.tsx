import { Building2Icon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/marketing/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EXAMS } from "@/content/exams";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth/dal";
import { invitationInfo } from "@/server/org";

import { acceptInvitationAction } from "./actions";

export const metadata = { title: "Únete a tu institución" };

const ROLE_ES = { ORG_ADMIN: "administrador", TEACHER: "docente", STUDENT: "estudiante" } as const;

export default function JoinPage(props: PageProps<"/unirse/[codigo]">) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-12">
      <Logo href="/" />
      <Suspense fallback={<Skeleton className="mt-8 h-72 w-full rounded-3xl" />}>
        <Join params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Join({ params, searchParams }: { params: PageProps<"/unirse/[codigo]">["params"]; searchParams: PageProps<"/unirse/[codigo]">["searchParams"] }) {
  const { codigo } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const [inv, user] = await Promise.all([invitationInfo(codigo), getCurrentUser()]);
  if (!inv)
    return (
      <div className="mt-8 rounded-3xl border bg-card p-8">
        <h1 className="font-heading text-2xl font-extrabold">Ese código no existe</h1>
        <p className="mt-2 text-muted-foreground">Revisa que esté bien escrito o pide a tu docente un enlace nuevo.</p>
      </div>
    );
  const next = `/unirse/${inv.code}`;
  return (
    <div className="mt-8 space-y-5 rounded-3xl border bg-card p-8">
      <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Building2Icon />
      </span>
      <div>
        <h1 className="font-heading text-2xl font-extrabold">{inv.org.name} te invita a MyPAL</h1>
        <p className="mt-1 text-muted-foreground">
          Como {ROLE_ES[inv.role]}
          {inv.group ? ` en el grupo ${inv.group.name} (${EXAMS[inv.group.exam].name})` : ""}.
        </p>
      </div>
      {inv.expired ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Esta invitación venció o ya se usó. Pide una nueva.</p>
      ) : !user ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Primero crea tu cuenta (o ingresa si ya tienes una). Después vuelves aquí automáticamente.</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/registro?next=${encodeURIComponent(next)}`} className={cn(buttonVariants(), "rounded-full")}>
              Crear mi cuenta
            </Link>
            <Link href={`/ingresar?next=${encodeURIComponent(next)}`} className={cn(buttonVariants({ variant: "outline" }), "rounded-full")}>
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      ) : (
        <form action={acceptInvitationAction} className="space-y-4">
          <input type="hidden" name="code" value={inv.code} />
          {inv.role === "STUDENT" && !inv.birthDate && (
            <label className="block space-y-1.5 text-sm font-medium">
              Tu fecha de nacimiento
              <input type="date" name="birthDate" required className="h-10 w-full rounded-xl border bg-background px-3" />
              <span className="block text-xs font-normal text-muted-foreground">
                {inv.org.allowsMinors ? "Desde los 15 años. Si eres menor de edad, tu institución tiene la autorización de tus representantes." : "Esta institución inscribe solo mayores de edad."}
              </span>
            </label>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button type="submit" className="w-full rounded-full">
            Unirme como {user.name}
          </Button>
          <p className="text-xs text-muted-foreground">
            Tu institución verá tu avance, tus resultados y tus entregas. Tu cuenta y tu historial siguen siendo tuyos si sales de ella.
          </p>
        </form>
      )}
    </div>
  );
}
