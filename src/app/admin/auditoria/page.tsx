import { DownloadIcon } from "lucide-react";
import { Suspense } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { auditQuery } from "@/server/admin/audit";
import { requireStaff } from "@/server/auth/dal";

export const metadata = { title: "Admin · Auditoría" };

export default function AuditPage(props: PageProps<"/admin/auditoria">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Audit searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Audit({ searchParams }: { searchParams: PageProps<"/admin/auditoria">["searchParams"] }) {
  await requireStaff();
  const sp = await searchParams;
  const filters = {
    action: typeof sp.accion === "string" ? sp.accion : "",
    entity: typeof sp.entidad === "string" ? sp.entidad : "",
    actor: typeof sp.autor === "string" ? sp.autor : "",
  };
  const rows = await auditQuery(filters, 200);
  const qs = new URLSearchParams(Object.entries({ accion: filters.action, entidad: filters.entity, autor: filters.actor }).filter(([, v]) => v)).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-heading text-3xl font-extrabold">Auditoría</h1>
        <a href={`/api/admin/auditoria/export${qs ? `?${qs}` : ""}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <DownloadIcon /> Exportar CSV
        </a>
      </div>
      <form className="flex flex-wrap gap-2 text-sm">
        <input name="accion" defaultValue={filters.action} placeholder="Acción (p. ej. config.set)" className="h-9 rounded-lg border bg-background px-2" />
        <input name="entidad" defaultValue={filters.entity} placeholder="Entidad (p. ej. User)" className="h-9 rounded-lg border bg-background px-2" />
        <input name="autor" defaultValue={filters.actor} placeholder="Correo de quien actuó" className="h-9 rounded-lg border bg-background px-2" />
        <Button type="submit" size="sm" variant="outline">
          Filtrar
        </Button>
      </form>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th>Fecha</th>
              <th>Quién</th>
              <th>Acción</th>
              <th>Entidad</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)} className="border-t align-top">
                <td className="whitespace-nowrap tabular-nums">{r.createdAt.toLocaleString("es")}</td>
                <td>{r.actorEmail ?? "sistema"}</td>
                <td className="font-mono text-xs">{r.action}</td>
                <td className="text-xs">
                  {r.entity}
                  {r.entityId && <span className="block text-muted-foreground">{r.entityId.slice(0, 12)}</span>}
                </td>
                <td className="max-w-md truncate font-mono text-xs text-muted-foreground">{r.after ? JSON.stringify(r.after) : ""}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="text-muted-foreground">
                  Sin registros con esos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
