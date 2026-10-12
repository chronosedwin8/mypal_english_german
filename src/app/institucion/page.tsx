import { Building2Icon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/marketing/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EXAMS, EXAM_CODES } from "@/content/exams";
import { ORG_LICENSES, formatUsd } from "@/lib/pricing/catalog";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { invitationUrl } from "@/server/org";

import { buyLicensesAction, createGroupAction, importCsvAction, inviteAction, removeMemberAction, updateOrgSettingsAction } from "./actions";

export const metadata = { title: "Institución" };

const ROLE_ES = { ORG_ADMIN: "Administración", TEACHER: "Docente", STUDENT: "Estudiante" } as const;

export default function InstitutionPage(props: PageProps<"/institucion">) {
  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Logo href="/app" />
          <span className="rounded bg-foreground px-2 py-0.5 text-xs font-bold text-background">INSTITUCIÓN</span>
          <Link href="/docente" className="ml-auto text-sm text-muted-foreground hover:text-foreground">
            Panel docente
          </Link>
          <Link href="/app" className="text-sm text-muted-foreground hover:text-foreground">
            Ir a la app
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
          <Institution searchParams={props.searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function Institution({ searchParams }: { searchParams: PageProps<"/institucion">["searchParams"] }) {
  const user = await requireUser("/institucion");
  const sp = await searchParams;
  const aviso = typeof sp.aviso === "string" ? sp.aviso : null;
  const admins = await db.orgMember.findMany({ where: { userId: user.id, status: "ACTIVE", role: "ORG_ADMIN" }, include: { org: true } });
  const orgs = user.role === "ADMIN" && typeof sp.org === "string" ? await db.organization.findMany({ where: { id: sp.org } }) : admins.map((a) => a.org);
  const org = orgs.find((o) => o.id === sp.org) ?? orgs[0];
  if (!org)
    return (
      <div className="rounded-3xl border bg-card p-8 text-center">
        <Building2Icon className="mx-auto size-10 text-muted-foreground" />
        <p className="mt-4 font-heading text-xl font-bold">No administras ninguna institución</p>
        <p className="mt-1 text-muted-foreground">Si tu colegio, universidad o empresa quiere usar MyPAL, pide una demo.</p>
        <Link href="/instituciones" className={cn(buttonVariants(), "mt-5 rounded-full")}>
          Ver planes para instituciones
        </Link>
      </div>
    );

  const now = new Date();
  const [licenses, members, groups, invitations] = await Promise.all([
    db.orgLicense.findMany({ where: { orgId: org.id }, orderBy: { periodEnd: "desc" } }),
    db.orgMember.findMany({ where: { orgId: org.id, status: "ACTIVE" }, include: { user: { select: { name: true, email: true } }, studying: { include: { group: true } } }, orderBy: { createdAt: "desc" } }),
    db.group.findMany({ where: { orgId: org.id }, include: { _count: { select: { students: true, teachers: true } } }, orderBy: { createdAt: "desc" } }),
    db.invitation.findMany({ where: { orgId: org.id, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const active = licenses.filter((l) => l.periodStart <= now && l.periodEnd > now);
  const seats = active.reduce((s, l) => s + l.seats, 0);
  const used = active.reduce((s, l) => s + l.used, 0);
  const thresholds = org.thresholds as { inactiveDays?: number; riskBandGap?: number };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">{org.name}</h1>
        <p className="text-muted-foreground">
          {{ COMPANY: "Empresa", SCHOOL: "Colegio", UNIVERSITY: "Universidad" }[org.type]} · {org.enabledExams.map((e) => EXAMS[e].shortName).join(", ") || "todos los exámenes"}
        </p>
      </div>
      {aviso && <p className="rounded-2xl border bg-card px-4 py-3 text-sm">{aviso}</p>}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Licencias en uso</p>
          <p className="mt-1 font-heading text-3xl font-extrabold tabular-nums">
            {used} <span className="text-lg text-muted-foreground">/ {seats}</span>
          </p>
          <Progress value={seats ? (used / seats) * 100 : 0} className="mt-2 h-1.5" />
        </div>
        <div className="rounded-3xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Personas</p>
          <p className="mt-1 font-heading text-3xl font-extrabold tabular-nums">{members.length}</p>
          <p className="text-xs text-muted-foreground">
            {members.filter((m) => m.role === "TEACHER").length} docentes · {members.filter((m) => m.isMinor).length} menores de edad
          </p>
        </div>
        <div className="rounded-3xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Grupos</p>
          <p className="mt-1 font-heading text-3xl font-extrabold tabular-nums">{groups.length}</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Licencias</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {licenses.map((l) => (
              <li key={l.id} className="flex justify-between">
                <span>
                  {ORG_LICENSES.find((x) => x.id === l.kind)?.nameEs} · {l.used}/{l.seats}
                </span>
                <span className="text-muted-foreground">hasta {l.periodEnd.toLocaleDateString("es")}</span>
              </li>
            ))}
            {!licenses.length && <li className="text-muted-foreground">Aún no hay licencias.</li>}
          </ul>
          <form action={buyLicensesAction} className="mt-4 grid gap-2 sm:grid-cols-4">
            <input type="hidden" name="orgId" value={org.id} />
            <select name="kind" className="h-9 rounded-lg border bg-background px-2 text-sm sm:col-span-2" aria-label="Tipo de licencia">
              {ORG_LICENSES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nameEs} · {formatUsd(l.priceUsdCents)}/mes
                </option>
              ))}
            </select>
            <input name="seats" type="number" min={1} defaultValue={20} className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Licencias" />
            <select name="months" defaultValue="6" className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Meses">
              <option value="6">6 meses</option>
              <option value="12">12 meses</option>
            </select>
            <Button type="submit" size="sm" variant="outline" className="sm:col-span-4">
              Agregar licencias (pago simulado)
            </Button>
          </form>
        </div>

        <div className="rounded-3xl border bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Grupos</h2>
          <ul className="mt-3 divide-y text-sm">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between py-2">
                <Link href={`/docente/grupo/${g.id}`} className="font-medium hover:underline">
                  {g.name}
                </Link>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <UsersIcon className="size-3.5" /> {g._count.students} · {EXAMS[g.exam].shortName}
                </span>
              </li>
            ))}
          </ul>
          <form action={createGroupAction} className="mt-4 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="orgId" value={org.id} />
            <input name="name" required placeholder="Nombre del grupo" className="h-9 rounded-lg border bg-background px-2 text-sm" />
            <select name="exam" className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Examen">
              {EXAM_CODES.map((c) => (
                <option key={c} value={c}>
                  {EXAMS[c].name}
                </option>
              ))}
            </select>
            <input name="targetDate" type="date" className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Fecha del examen" />
            <input name="targetScore" type="number" step="0.5" placeholder="Meta (banda o puntos)" className="h-9 rounded-lg border bg-background px-2 text-sm" />
            <Button type="submit" size="sm" variant="outline" className="sm:col-span-2">
              Crear grupo
            </Button>
          </form>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Invitar</h2>
          <form action={inviteAction} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="orgId" value={org.id} />
            <select name="role" className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Rol">
              <option value="STUDENT">Estudiante</option>
              <option value="TEACHER">Docente</option>
              <option value="ORG_ADMIN">Administración</option>
            </select>
            <select name="groupId" className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Grupo">
              <option value="">Sin grupo</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <input name="email" type="email" placeholder="Correo (vacío = código para compartir)" className="h-9 rounded-lg border bg-background px-2 text-sm sm:col-span-2" />
            <input name="maxUses" type="number" min={1} defaultValue={40} className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Usos del código" />
            <Button type="submit" size="sm" variant="outline">
              Crear invitación
            </Button>
          </form>
          <ul className="mt-4 space-y-1 text-xs">
            {invitations.map((i) => (
              <li key={i.id} className="flex justify-between gap-2">
                <span className="font-mono">{i.code}</span>
                <span className="truncate text-muted-foreground">
                  {i.email ?? `${i.uses}/${i.maxUses} usos`} · {ROLE_ES[i.role]}
                </span>
                <a href={invitationUrl(i.code)} className="text-primary hover:underline">
                  enlace
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-3xl border bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Carga masiva de estudiantes</h2>
          <p className="mt-1 text-xs text-muted-foreground">Una persona por línea: nombre, correo, grupo, fecha de nacimiento (AAAA-MM-DD, opcional). Cada una recibe su invitación por correo.</p>
          <form action={importCsvAction} className="mt-3 space-y-2">
            <input type="hidden" name="orgId" value={org.id} />
            <Textarea name="csv" rows={5} spellCheck={false} placeholder={"Ana Pérez, ana@colegio.edu.co, 11A IELTS, 2009-04-12\nLuis Gómez, luis@colegio.edu.co, 11A IELTS"} className="font-mono text-xs" />
            <Button type="submit" size="sm" variant="outline">
              Enviar invitaciones
            </Button>
          </form>
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-heading text-lg font-bold">Personas</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm [&_td]:px-2 [&_td]:py-2 [&_th]:px-2">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Grupos</th>
                <th>Licencia</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t">
                  <td>
                    {m.user.name}
                    <span className="block text-xs text-muted-foreground">{m.user.email}</span>
                  </td>
                  <td>
                    {ROLE_ES[m.role]}
                    {m.isMinor && <span className="ml-1 rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-900">MENOR</span>}
                  </td>
                  <td className="text-xs">{m.studying.map((s) => s.group.name).join(", ") || "—"}</td>
                  <td className="text-xs">{m.licenseId ? "Sí" : "—"}</td>
                  <td className="text-right">
                    {m.userId !== user.id && (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="orgId" value={org.id} />
                        <input type="hidden" name="memberId" value={m.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          Retirar
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-6">
        <h2 className="font-heading text-lg font-bold">Configuración</h2>
        <form action={updateOrgSettingsAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="orgId" value={org.id} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="allowsMinors" defaultChecked={org.allowsMinors} className="mt-1 accent-primary" />
            <span>
              Inscribir estudiantes de 15 a 17 años
              <span className="block text-xs text-muted-foreground">Siempre con supervisión docente. Las compras y los correos comerciales quedan desactivados para ellos.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="minorsDeclaration" defaultChecked={Boolean(org.minorsDeclarationAt)} className="mt-1 accent-primary" />
            <span>
              Declaro que la institución tiene la autorización previa, expresa e informada de los representantes legales (Ley 1581 de 2012), que incluye el uso de un tutor de IA por video.
              {org.minorsDeclarationAt && <span className="block text-xs text-muted-foreground">Registrada el {org.minorsDeclarationAt.toLocaleDateString("es")}.</span>}
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="avatarForMinors" defaultChecked={org.avatarForMinors} className="mt-1 accent-primary" />
            <span>
              Tutor con avatar para menores
              <span className="block text-xs text-muted-foreground">Con reglas de seguridad en cada clase. Cada docente puede apagarlo para su grupo.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="cameraAllowed" defaultChecked={org.cameraAllowed} className="mt-1 accent-primary" />
            <span>Permitir la cámara en las clases con el tutor</span>
          </label>
          <label className="text-sm">
            Días sin práctica para marcar “inactivo”
            <input name="inactiveDays" type="number" min={1} max={60} defaultValue={thresholds.inactiveDays ?? 7} className="mt-1 h-9 w-full rounded-lg border bg-background px-2" />
          </label>
          <label className="text-sm">
            Distancia a la meta para marcar “en riesgo” (banda o puntos)
            <input name="riskBandGap" type="number" step="0.5" min={0} max={50} defaultValue={thresholds.riskBandGap ?? 0.5} className="mt-1 h-9 w-full rounded-lg border bg-background px-2" />
          </label>
          <label className="text-sm">
            Días que se guardan las grabaciones de Speaking
            <input name="recordingsRetentionDays" type="number" min={7} max={730} defaultValue={org.recordingsRetentionDays} className="mt-1 h-9 w-full rounded-lg border bg-background px-2" />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit">Guardar configuración</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
