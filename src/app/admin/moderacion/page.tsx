import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/server/auth/dal";
import { db } from "@/server/db";

import { resolveFlagAction } from "../actions";

export const metadata = { title: "Admin · Moderación" };

const KIND_ES: Record<string, string> = { QUESTION: "Pregunta reportada", MINOR_SESSION: "Clase de menor", CONTENT: "Contenido marcado" };

export default function ModerationPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Moderation />
    </Suspense>
  );
}

async function Moderation() {
  await requireStaff();
  const flags = await db.moderationFlag.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 });
  const users = await db.user.findMany({ where: { id: { in: flags.map((f) => f.userId).filter(Boolean) as string[] } }, select: { id: true, email: true } });
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-3xl font-extrabold">Moderación y alertas</h1>
      <ul className="space-y-3">
        {flags.map((f) => (
          <li key={f.id} className={cn("rounded-2xl border bg-card p-4 text-sm", f.status === "OPEN" && f.severity === "HIGH" && "border-rose-400")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                {KIND_ES[f.kind] ?? f.kind} · {f.severity}
                <span className={cn("ml-2 rounded px-1.5 text-xs", f.status === "OPEN" ? "bg-amber-100 text-amber-900" : "bg-muted")}>{f.status === "OPEN" ? "abierta" : "cerrada"}</span>
              </p>
              <span className="text-xs text-muted-foreground">
                {f.createdAt.toLocaleString("es")} · {users.find((u) => u.id === f.userId)?.email ?? "sistema"}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-line">{f.note}</p>
            {f.kind === "QUESTION" && f.refId && (
              <Link href={`/admin/examenes/${f.refId.split("#")[0]}`} className="mt-1 inline-block text-primary hover:underline">
                Ver el bloque (pregunta {f.refId.split("#")[1]})
              </Link>
            )}
            {f.status === "OPEN" && (
              <form action={resolveFlagAction} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="id" value={f.id} />
                <input name="note" placeholder="Nota (opcional)" className="h-8 min-w-48 flex-1 rounded-lg border bg-background px-2" />
                <Button type="submit" name="action" value="RESOLVED" size="sm">
                  Cerrar
                </Button>
                <Button type="submit" name="action" value="ESCALATED" size="sm" variant="outline">
                  Escalar
                </Button>
              </form>
            )}
          </li>
        ))}
        {!flags.length && <li className="text-muted-foreground">No hay alertas.</li>}
      </ul>
    </div>
  );
}
