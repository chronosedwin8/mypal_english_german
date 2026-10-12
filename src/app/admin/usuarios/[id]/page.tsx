import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { requireStaff } from "@/server/auth/dal";
import { db } from "@/server/db";
import { quotaSummary } from "@/server/exams/entitlements";
import { checkLedgerInvariants, getBalance } from "@/server/ledger/wallet";

import { grantExamQuotaAction, grantMinutes, setRoleAction, setSuspendedAction } from "../../actions";

export const metadata = { title: "Admin · Usuario" };

export default function UserPage({ params, searchParams }: PageProps<"/admin/usuarios/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <UserDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function UserDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const ok = sp.ok;
  const aviso = typeof sp.aviso === "string" ? sp.aviso : null;
  const user = await db.user.findUnique({
    where: { id },
    include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 3 }, profiles: true, trialClaim: true },
  });
  if (!user) notFound();
  const [quota, memberships, attempts] = await Promise.all([
    quotaSummary(id),
    db.orgMember.findMany({ where: { userId: id }, include: { org: { select: { name: true } } } }),
    db.examAttempt.groupBy({ by: ["mode", "status"], where: { userId: id }, _count: true }),
  ]);
  const [balance, ledger, sessions, invariants] = await Promise.all([
    getBalance(id),
    db.ledgerEntry.findMany({ where: { userId: id }, orderBy: { id: "desc" }, take: 30 }),
    db.tutorSession.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
    checkLedgerInvariants(id),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-extrabold">{user.email}</h1>
        <p className="text-muted-foreground">
          {user.name} · {user.role} · {user.emailVerified ? "verificado" : "sin verificar"} · prueba {user.trialClaim ? "usada" : "disponible"}
          {user.twoFactorEnabled ? " · 2FA activo" : ""}
          {user.bannedAt && <b className="text-destructive"> · SUSPENDIDA desde {user.bannedAt.toLocaleDateString("es")}</b>}
        </p>
      </div>
      {aviso && (
        <Alert>
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="font-semibold">Exámenes</h2>
          <p className="mt-2 text-sm">
            Cupos disponibles: {quota.MOCK.available} simulacros · {quota.WRITING.available} Writing · {quota.SPEAKING.available} Speaking
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {attempts.map((a) => (
              <li key={`${a.mode}-${a.status}`}>
                {a.mode} {a.status.toLowerCase()}: {a._count}
              </li>
            ))}
          </ul>
          <form action={grantExamQuotaAction} className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <input type="hidden" name="userId" value={user.id} />
            <select name="kind" className="h-9 rounded-lg border bg-background px-2" aria-label="Tipo de cupo">
              <option value="MOCK">Simulacros</option>
              <option value="WRITING">Writing</option>
              <option value="SPEAKING">Speaking</option>
            </select>
            <input name="amount" type="number" min={1} defaultValue={1} className="h-9 rounded-lg border bg-background px-2" aria-label="Cantidad" />
            <input name="days" type="number" min={1} defaultValue={30} className="h-9 rounded-lg border bg-background px-2" aria-label="Días" />
            <input name="reason" required minLength={3} placeholder="Motivo" className="h-9 rounded-lg border bg-background px-2" />
            <Button type="submit" size="sm" variant="outline" className="col-span-2">
              Otorgar cupo
            </Button>
          </form>
        </section>
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="font-semibold">Instituciones</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {memberships.map((m) => (
              <li key={m.id}>
                {m.org.name} · {m.role} · {m.status}
                {m.isMinor && " · menor de edad"}
              </li>
            ))}
            {!memberships.length && <li className="text-muted-foreground">Usuario individual.</li>}
          </ul>
        </section>
        <section className="space-y-3 rounded-2xl border bg-card p-6">
          <h2 className="font-semibold">Cuenta</h2>
          <form action={setRoleAction} className="flex gap-2">
            <input type="hidden" name="userId" value={user.id} />
            <select name="role" defaultValue={user.role} className="h-9 flex-1 rounded-lg border bg-background px-2 text-sm" aria-label="Rol">
              <option value="STUDENT">Estudiante</option>
              <option value="SUPPORT">Soporte (solo lectura)</option>
              <option value="ADMIN">Administrador</option>
            </select>
            <Button type="submit" size="sm" variant="outline">
              Cambiar rol
            </Button>
          </form>
          <form action={setSuspendedAction} className="space-y-2">
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="suspend" value={user.bannedAt ? "false" : "true"} />
            {!user.bannedAt && <input name="reason" placeholder="Motivo de la suspensión" className="h-9 w-full rounded-lg border bg-background px-2 text-sm" />}
            <Button type="submit" size="sm" variant={user.bannedAt ? "outline" : "destructive"} className="w-full">
              {user.bannedAt ? "Reactivar cuenta" : "Suspender cuenta"}
            </Button>
          </form>
          <Link href={`/admin/usuarios/${user.id}/ver`} className="block text-sm font-semibold text-primary hover:underline">
            Ver como este usuario (solo lectura)
          </Link>
        </section>
      </div>
      {ok && (
        <Alert>
          <AlertDescription>Minutos otorgados y registrados en la auditoría.</AlertDescription>
        </Alert>
      )}
      {invariants.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>⚠ Inconsistencias en el ledger: {JSON.stringify(invariants)}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="font-semibold">Saldo</h2>
          <p className="mt-2 font-heading text-3xl font-extrabold">{Math.floor(balance.paidAvailableSeconds / 60)} min</p>
          <p className="text-sm text-muted-foreground">
            Prueba: {balance.trialAvailableSeconds} s · retenido: {balance.heldSeconds} s
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {balance.buckets.map((b) => (
              <li key={b.id} className="flex justify-between">
                <span>{b.source}</span>
                <span className="tabular-nums">
                  {b.availableSeconds}/{b.grantedSeconds} s · vence {b.expiresAt.toLocaleDateString("es")}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="font-semibold">Regalar minutos</h2>
          <form action={grantMinutes} className="mt-3 space-y-3">
            <input type="hidden" name="userId" value={user.id} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="minutes">Minutos</Label>
                <Input id="minutes" name="minutes" type="number" min={1} max={600} defaultValue={10} />
              </div>
              <div>
                <Label htmlFor="days">Vigencia (días)</Label>
                <Input id="days" name="days" type="number" min={1} max={365} defaultValue={30} />
              </div>
            </div>
            <div>
              <Label htmlFor="reason">Motivo</Label>
              <Input id="reason" name="reason" required minLength={3} placeholder="Compensación por falla técnica" />
            </div>
            <Button type="submit">Otorgar</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">Cada concesión queda en la auditoría y en el ledger.</p>
        </section>
      </div>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="font-semibold">Clases recientes</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2">Fecha</th>
              <th>Estado</th>
              <th>Reservado</th>
              <th>Facturado</th>
              <th>Cobrado</th>
              <th>Motivo de cierre</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="py-2">{s.createdAt.toLocaleString("es")}</td>
                <td>{s.status}{s.isTrial ? " · prueba" : ""}</td>
                <td>{s.reservedSeconds} s</td>
                <td>{s.billedSeconds ?? "—"} s</td>
                <td>{s.chargedSeconds ?? "—"} s</td>
                <td>{s.endReason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="font-semibold">Ledger (últimos 30 movimientos)</h2>
        <table className="mt-3 w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2">#</th>
              <th>Tipo</th>
              <th>Seg.</th>
              <th>Δ disponible</th>
              <th>Δ retenido</th>
              <th>Motivo</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((l) => (
              <tr key={String(l.id)} className="border-t font-mono">
                <td className="py-1.5">{String(l.id)}</td>
                <td>{l.type}</td>
                <td>{l.seconds}</td>
                <td>{l.deltaAvailable}</td>
                <td>{l.deltaHeld}</td>
                <td className="font-sans">{l.reason ?? ""}</td>
                <td>{l.createdAt.toLocaleString("es")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
