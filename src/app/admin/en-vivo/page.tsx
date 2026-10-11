import { Suspense } from "react";

import { AutoRefresh } from "@/components/app/auto-refresh";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { liveOverview } from "@/server/admin/metrics";
import { requireAdmin } from "@/server/auth/dal";

import { forceEnd } from "../actions";

export const metadata = { title: "Admin · En vivo" };

export default function LivePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Live />
    </Suspense>
  );
}

async function Live() {
  await requireAdmin();
  const { sessions, slots, queue } = await liveOverview();
  return (
    <div className="space-y-8">
      <AutoRefresh everyMs={5000} />
      <h1 className="font-heading text-3xl font-extrabold">En vivo</h1>

      <section>
        <h2 className="font-semibold">Cupos de clases simultáneas</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {slots.map((s) => (
            <div
              key={s.id}
              className={cn(
                "rounded-xl border px-4 py-3 text-sm",
                s.state === "BUSY" && "border-primary bg-primary/10",
                s.state === "OFFERED" && "border-sun bg-sun/20",
                s.state === "DISABLED" && "opacity-40",
              )}
            >
              <p className="font-bold">Cupo {s.id}</p>
              <p className="text-muted-foreground">{s.state}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold">Clases abiertas ({sessions.length})</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="p-3">Usuario</th>
                <th>Estado</th>
                <th>Idioma</th>
                <th>Inicio</th>
                <th>Reserva</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const start = s.tavusCreatedAt ?? s.createRequestedAt ?? s.createdAt;
                return (
                  <tr key={s.id} className="border-t">
                    <td className="p-3">
                      {s.user.email}
                      {s.isTrial && <span className="ml-2 rounded bg-sun/40 px-1.5 text-[10px] font-bold">PRUEBA</span>}
                    </td>
                    <td>{s.status}</td>
                    <td>{s.language}</td>
                    <td className="tabular-nums">desde {start.toLocaleTimeString("es")}</td>
                    <td className="tabular-nums">{s.reservedSeconds} s</td>
                    <td className="p-2 text-right">
                      {["READY", "LIVE", "ENDING"].includes(s.status) && (
                        <form action={forceEnd}>
                          <input type="hidden" name="sessionId" value={s.id} />
                          <Button type="submit" size="sm" variant="destructive">Forzar fin</Button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!sessions.length && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">No hay clases en curso.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-semibold">Fila de espera ({queue.length})</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-6 text-sm">
          {queue.map((q) => (
            <li key={q.id}>
              {q.user.email} · {q.status} · desde {q.createdAt.toLocaleTimeString("es")}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
