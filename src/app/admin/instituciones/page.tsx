import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EXAMS, EXAM_CODES } from "@/content/exams";
import { requireStaff } from "@/server/auth/dal";
import { db } from "@/server/db";

import { createOrgAction, updateLeadAction } from "./actions";

export const metadata = { title: "Admin · Instituciones" };

const TYPE_ES = { COMPANY: "Empresa", SCHOOL: "Colegio", UNIVERSITY: "Universidad" } as const;
const LEAD_STATUS = { NEW: "Nueva", CONTACTED: "Contactada", WON: "Ganada", LOST: "Perdida" } as const;

export default function AdminInstitutions(props: PageProps<"/admin/instituciones">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Institutions searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Institutions({ searchParams }: { searchParams: PageProps<"/admin/instituciones">["searchParams"] }) {
  await requireStaff();
  const sp = await searchParams;
  const aviso = typeof sp.aviso === "string" ? sp.aviso : null;
  const [orgs, leads, flags] = await Promise.all([
    db.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { members: true, groups: true } }, licenses: true },
    }),
    db.institutionLead.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    db.moderationFlag.count({ where: { status: "OPEN" } }),
  ]);
  const now = new Date();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-heading text-3xl font-extrabold">Instituciones</h1>
        <p className="text-sm text-muted-foreground">{flags} alertas de moderación abiertas.</p>
      </div>
      {aviso && <p className="rounded-xl border bg-card px-4 py-3 text-sm">{aviso}</p>}

      <section>
        <h2 className="font-semibold">Solicitudes de demo</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th>Institución</th>
                <th>Contacto</th>
                <th>Estudiantes</th>
                <th>Exámenes</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-t align-top">
                  <td>
                    <b>{l.institution}</b>
                    <span className="block text-xs text-muted-foreground">
                      {TYPE_ES[l.type]} · {l.createdAt.toLocaleDateString("es")}
                    </span>
                    {l.message && <span className="block max-w-xs text-xs text-muted-foreground">{l.message}</span>}
                  </td>
                  <td>
                    {l.contactName}
                    <span className="block text-xs text-muted-foreground">
                      {l.email}
                      {l.phone ? ` · ${l.phone}` : ""}
                    </span>
                  </td>
                  <td className="tabular-nums">{l.students}</td>
                  <td className="text-xs">{l.exams.join(", ") || "—"}</td>
                  <td>
                    <form action={updateLeadAction} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={l.id} />
                      <select name="status" defaultValue={l.status} className="h-8 rounded-lg border bg-background px-2 text-xs" aria-label="Estado">
                        {Object.entries(LEAD_STATUS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" size="sm" variant="ghost">
                        Guardar
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
              {!leads.length && (
                <tr>
                  <td colSpan={5} className="text-muted-foreground">
                    Sin solicitudes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="font-semibold">Instituciones</h2>
          <ul className="mt-3 divide-y rounded-2xl border bg-card text-sm">
            {orgs.map((o) => {
              const active = o.licenses.filter((l) => l.periodStart <= now && l.periodEnd > now);
              return (
                <li key={o.id} className="flex items-center justify-between gap-3 p-3">
                  <span>
                    <b>{o.name}</b>
                    <span className="block text-xs text-muted-foreground">
                      {TYPE_ES[o.type]} · {o._count.members} personas · {o._count.groups} grupos · licencias {active.reduce((s, l) => s + l.used, 0)}/
                      {active.reduce((s, l) => s + l.seats, 0)}
                      {o.allowsMinors && " · admite menores"}
                    </span>
                  </span>
                  <Link href={`/institucion?org=${o.id}`} className="text-primary hover:underline">
                    Abrir
                  </Link>
                </li>
              );
            })}
            {!orgs.length && <li className="p-3 text-muted-foreground">Todavía no hay instituciones.</li>}
          </ul>
        </div>
        <div>
          <h2 className="font-semibold">Crear institución</h2>
          <form action={createOrgAction} className="mt-3 space-y-2 rounded-2xl border bg-card p-4 text-sm">
            <input name="name" required placeholder="Nombre" className="h-9 w-full rounded-lg border bg-background px-2" />
            <select name="type" className="h-9 w-full rounded-lg border bg-background px-2" aria-label="Tipo">
              <option value="SCHOOL">Colegio</option>
              <option value="UNIVERSITY">Universidad</option>
              <option value="COMPANY">Empresa</option>
            </select>
            <input name="adminEmail" type="email" required placeholder="Correo de quien la administra" className="h-9 w-full rounded-lg border bg-background px-2" />
            <fieldset className="flex flex-wrap gap-2">
              {EXAM_CODES.map((c) => (
                <label key={c} className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                  <input type="checkbox" name="exams" value={c} defaultChecked={c === "IELTS_ACADEMIC"} className="accent-primary" /> {EXAMS[c].shortName}
                </label>
              ))}
            </fieldset>
            <Button type="submit" size="sm" className="w-full">
              Crear e invitar
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
