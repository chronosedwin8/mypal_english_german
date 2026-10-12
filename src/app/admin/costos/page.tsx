import Link from "next/link";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { costReport } from "@/server/admin/metrics";
import { requireStaff } from "@/server/auth/dal";
import { getConfig } from "@/server/config";

export const metadata = { title: "Admin · Costos" };

const usd = (micro: number) => `$${(micro / 1e6).toFixed(2)}`;

export default function CostsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Costs />
    </Suspense>
  );
}

async function Costs() {
  await requireStaff();
  const [config, { daily, byPurpose, topUsers, people }] = await Promise.all([getConfig(), costReport(30)]);
  const days = [...new Set(daily.map((d) => d.day.toISOString().slice(0, 10)))];
  const providers = [...new Set(daily.map((d) => d.provider))];
  const max = Math.max(1, ...days.map((day) => daily.filter((d) => d.day.toISOString().slice(0, 10) === day).reduce((s, d) => s + Number(d.micro), 0)));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-extrabold">Costos y presupuestos</h1>
        <p className="text-sm text-muted-foreground">
          Tope diario de IA y voz: ${config["ai.dailyBudgetUsd"]} · voz del banco: {config["voice.monthlyCharBudget"].toLocaleString("es")} caracteres al mes · exámenes{" "}
          {config["exam.enabled"] ? "activos" : "en pausa"}.{" "}
          <Link href="/admin/configuracion" className="text-primary hover:underline">
            Ajustar topes o apagar funciones
          </Link>
        </p>
      </div>

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Gasto diario (30 días)</h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          {days.map((day) => {
            const rows = daily.filter((d) => d.day.toISOString().slice(0, 10) === day);
            const total = rows.reduce((s, d) => s + Number(d.micro), 0);
            return (
              <li key={day} className="grid grid-cols-[6rem_1fr_6rem] items-center gap-3">
                <span className="tabular-nums text-muted-foreground">{day}</span>
                <span className="flex h-3 overflow-hidden rounded bg-muted">
                  {providers.map((p, i) => {
                    const v = Number(rows.find((r) => r.provider === p)?.micro ?? 0);
                    return <span key={p} style={{ width: `${(v / max) * 100}%`, background: ["#6d28d9", "#e8590c", "#2f9e44", "#1f6feb"][i % 4] }} title={`${p}: ${usd(v)}`} />;
                  })}
                </span>
                <span className="text-right tabular-nums">{usd(total)}</span>
              </li>
            );
          })}
          {!days.length && <li className="text-muted-foreground">Sin gasto registrado.</li>}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{providers.map((p, i) => `${["morado", "naranja", "verde", "azul"][i % 4]} = ${p}`).join(" · ")}</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">Por función (30 días)</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {byPurpose.map((p) => (
              <li key={p.purpose} className="flex justify-between gap-2">
                <span>
                  {p.purpose} <span className="text-muted-foreground">· {p._count} llamadas</span>
                </span>
                <span className="tabular-nums">{usd(Number(p._sum.costMicroUsd ?? 0))}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">Personas con más gasto (30 días)</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {topUsers.map((u) => {
              const p = people.find((x) => x.id === u.userId);
              return (
                <li key={u.userId} className="flex justify-between gap-2">
                  <Link href={`/admin/usuarios/${u.userId}`} className="hover:underline">
                    {p?.email ?? u.userId}
                    {p && p.role !== "STUDENT" && <span className="ml-1 text-xs text-muted-foreground">(interno)</span>}
                  </Link>
                  <span className="tabular-nums">{usd(Number(u._sum.costMicroUsd ?? 0))}</span>
                </li>
              );
            })}
            {!topUsers.length && <li className="text-muted-foreground">Sin datos.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
