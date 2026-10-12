import { UsersIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EXAMS } from "@/content/exams";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/dal";
import { teacherGroups } from "@/server/org/teaching";

export const metadata = { title: "Panel docente" };

export default function TeacherHome() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
      <Groups />
    </Suspense>
  );
}

async function Groups() {
  const user = await requireUser("/docente");
  const orgs = await teacherGroups(user.id);
  if (!orgs.length)
    return (
      <div className="rounded-3xl border bg-card p-8 text-center">
        <p className="font-heading text-xl font-bold">Todavía no eres docente en ninguna institución</p>
        <p className="mt-1 text-muted-foreground">Pide a la coordinación de tu institución una invitación como docente.</p>
        <Link href="/instituciones" className={cn(buttonVariants({ variant: "outline" }), "mt-5 rounded-full")}>
          MyPAL para instituciones
        </Link>
      </div>
    );
  return (
    <div className="space-y-8">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight">Mis grupos</h1>
      {orgs.map(({ org, groups, member }) => (
        <section key={org.id}>
          <h2 className="font-semibold text-muted-foreground">
            {org.name} · {member.role === "ORG_ADMIN" ? "administración" : "docente"}
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <Link key={g.id} href={`/docente/grupo/${g.id}`} className="rounded-3xl border bg-card p-5 transition-shadow hover:shadow-md">
                <p className="font-heading text-lg font-bold">{g.name}</p>
                <p className="text-sm text-muted-foreground">{EXAMS[g.exam].name}</p>
                <p className="mt-3 flex items-center gap-1.5 text-sm">
                  <UsersIcon className="size-4" /> {g._count.students} estudiantes · {g._count.assignments} tareas
                </p>
                {g.targetDate && <p className="text-xs text-muted-foreground">Examen: {g.targetDate.toLocaleDateString("es")}</p>}
              </Link>
            ))}
            {!groups.length && <p className="text-sm text-muted-foreground">Sin grupos todavía. La coordinación los crea en el panel de la institución.</p>}
          </div>
        </section>
      ))}
    </div>
  );
}
