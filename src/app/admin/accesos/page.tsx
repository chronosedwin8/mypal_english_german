import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RESOURCES } from "@/lib/access/resources";
import { requireStaff } from "@/server/auth/dal";
import { db } from "@/server/db";

import { createAccessRuleAction, deleteAccessRuleAction } from "../actions";

export const metadata = { title: "Admin · Accesos" };

const SCOPE_ES = { GLOBAL: "Todos", ORG: "Institución", GROUP: "Grupo", USER: "Usuario" } as const;

export default function AccessPage(props: PageProps<"/admin/accesos">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Access searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Access({ searchParams }: { searchParams: PageProps<"/admin/accesos">["searchParams"] }) {
  await requireStaff();
  const sp = await searchParams;
  const aviso = typeof sp.aviso === "string" ? sp.aviso : null;
  const rules = await db.accessRule.findMany({ orderBy: { createdAt: "desc" } });
  const userIds = rules.filter((r) => r.scope === "USER").map((r) => r.scopeId);
  const orgIds = rules.filter((r) => r.scope === "ORG").map((r) => r.scopeId);
  const groupIds = rules.filter((r) => r.scope === "GROUP").map((r) => r.scopeId);
  const [users, orgs, groups] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }),
    db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }),
    db.group.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true } }),
  ]);
  const who = (scope: string, id: string) =>
    scope === "USER" ? users.find((u) => u.id === id)?.email : scope === "ORG" ? orgs.find((o) => o.id === id)?.name : scope === "GROUP" ? groups.find((g) => g.id === id)?.name : "—";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-extrabold">Accesos</h1>
        <p className="text-sm text-muted-foreground">
          Orden de decisión: usuario → grupo → institución → plan o licencia → global. Los cupos se siguen exigiendo aparte.
        </p>
      </div>
      {aviso && <p className="rounded-xl border bg-card px-4 py-3 text-sm">{aviso}</p>}

      <section className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th>Ámbito</th>
              <th>Recurso</th>
              <th>Decisión</th>
              <th>Motivo</th>
              <th>Vence</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t">
                <td>
                  {SCOPE_ES[r.scope as keyof typeof SCOPE_ES] ?? r.scope}
                  <span className="block text-xs text-muted-foreground">{who(r.scope, r.scopeId)}</span>
                </td>
                <td>{RESOURCES[r.resource as keyof typeof RESOURCES] ?? r.resource}</td>
                <td className={r.allowed ? "text-emerald-600" : "text-rose-600"}>{r.allowed ? "Permitido" : "Bloqueado"}</td>
                <td className="max-w-xs text-xs">{r.reason}</td>
                <td className="text-xs">{r.expiresAt ? r.expiresAt.toLocaleDateString("es") : "—"}</td>
                <td>
                  <form action={deleteAccessRuleAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      Quitar
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
            {!rules.length && (
              <tr>
                <td colSpan={6} className="text-muted-foreground">
                  Sin reglas: aplican los planes, las licencias y la configuración global.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Nueva regla o excepción</h2>
        <form action={createAccessRuleAction} className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <select name="scope" className="h-9 rounded-lg border bg-background px-2" aria-label="Ámbito">
            <option value="USER">Usuario (correo)</option>
            <option value="GROUP">Grupo (id)</option>
            <option value="ORG">Institución (identificador)</option>
            <option value="GLOBAL">Todos</option>
          </select>
          <input name="target" placeholder="correo, id del grupo o identificador" className="h-9 rounded-lg border bg-background px-2 sm:col-span-2" />
          <select name="resource" className="h-9 rounded-lg border bg-background px-2" aria-label="Recurso">
            {Object.entries(RESOURCES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select name="allowed" className="h-9 rounded-lg border bg-background px-2" aria-label="Decisión">
            <option value="true">Permitir</option>
            <option value="false">Bloquear</option>
          </select>
          <input name="days" type="number" min={0} defaultValue={30} className="h-9 rounded-lg border bg-background px-2" aria-label="Días (0 = sin vencimiento)" />
          <input name="reason" required minLength={3} placeholder="Motivo (queda en la auditoría)" className="h-9 rounded-lg border bg-background px-2 sm:col-span-2" />
          <Button type="submit" size="sm">
            Guardar regla
          </Button>
        </form>
      </section>
    </div>
  );
}
