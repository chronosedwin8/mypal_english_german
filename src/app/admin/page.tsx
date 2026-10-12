import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { EXAM_PRODUCTS, ORG_LICENSES, PLANS, TOPUPS, formatUsd } from "@/lib/pricing/catalog";
import { DEFAULT_COSTS, examProductMargin, worstCaseMargin } from "@/lib/pricing/margin";
import { cn } from "@/lib/utils";
import { businessMetrics, examMetrics } from "@/server/admin/metrics";
import { requireStaff } from "@/server/auth/dal";
import { getConfig } from "@/server/config";

export const metadata = { title: "Admin · Resumen" };

const usd = (cents: number) => `$${(cents / 100).toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)} %`);

export default function AdminHome() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Metrics />
    </Suspense>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-heading text-3xl font-extrabold tabular-nums", tone === "good" && "text-[oklch(0.55_0.15_160)]", tone === "bad" && "text-destructive")}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

async function Metrics() {
  await requireStaff();
  const [m, config, x] = await Promise.all([businessMetrics(), getConfig(), examMetrics()]);
  const toneFor = (v: number | null) => (v === null ? undefined : v >= m.targetMargin ? "good" : "bad");
  const costs = { ...DEFAULT_COSTS, tavusCostPerMinUsd: config["tavus.costPerMinMicroUsd"] / 1_000_000 };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold">Resumen del mes</h1>
          <p className="text-muted-foreground">Margen objetivo: ≥ 60 % sobre el precio.</p>
        </div>
        {config["tavus.killSwitch"] && (
          <span className="rounded-full bg-destructive px-4 py-2 text-sm font-bold text-white">⛔ Clases en pausa (interruptor activo)</span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ingresos brutos" value={usd(m.grossCents)} hint={`${m.paymentsCount} pagos · comisiones ${usd(m.feeCents)}`} />
        <Kpi label="Costo Tavus (clases pagadas)" value={usd(m.paidCostCents)} hint={`${m.paidSessions} clases`} />
        <Kpi label="Costo de pruebas gratis" value={usd(m.trialCostCents)} hint={`${m.trialSessions} pruebas (costo de adquisición)`} />
        <Kpi label="Minutos Tavus del mes" value={m.billedMinutes.toFixed(0)} hint={`Factura estimada ${usd(m.tavusBillCents)} (${m.tavusTier.nameEs})`} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Kpi label="Margen real" value={pct(m.realizedMargin)} tone={toneFor(m.realizedMargin)} hint="Ingresos − comisiones − costo de lo consumido" />
        <Kpi
          label="Margen peor caso"
          value={pct(m.worstCaseMargin)}
          tone={toneFor(m.worstCaseMargin)}
          hint={`Si se usaran los ${Math.round(m.outstandingSeconds / 60)} min vendidos aún vigentes`}
        />
        <Kpi label="Margen con fijo de Tavus" value={pct(m.fullyLoadedMargin)} tone={toneFor(m.fullyLoadedMargin)} hint="Incluye la cuota mensual del plan Tavus" />
      </div>

      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold">Exámenes e instituciones</h2>
        {(x.flags > 0 || x.failedJobs > 0 || x.todayCents >= x.dailyBudgetCents * 0.8) && (
          <div className="flex flex-wrap gap-2 text-sm">
            {x.flags > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-900">{x.flags} alertas de moderación abiertas</span>}
            {x.failedJobs > 0 && <span className="rounded-full bg-rose-100 px-3 py-1 font-semibold text-rose-900">{x.failedJobs} trabajos de IA fallidos este mes</span>}
            {x.todayCents >= x.dailyBudgetCents * 0.8 && (
              <span className="rounded-full bg-rose-100 px-3 py-1 font-semibold text-rose-900">
                IA y voz hoy: {usd(x.todayCents)} de {usd(x.dailyBudgetCents)}
              </span>
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Ingresos por exámenes" value={usd(x.examRevenueCents)} hint={x.examByProduct.map((p) => `${p.planId}: ${p.count}`).join(" · ") || "sin ventas este mes"} />
          <Kpi label="Licencias institucionales (mes)" value={usd(x.licenseMonthlyCents)} hint={`${x.licenseUsed} de ${x.licenseSeats} licencias en uso`} />
          <Kpi label="IA y voz por uso" value={usd(x.variableAiCostCents)} hint={`${x.writing} Writing · ${x.speaking} Speaking · ${x.mocks} simulacros`} />
          <Kpi label="Producción del banco (fijo)" value={usd(x.bankCostCents)} hint={`${x.bank.APPROVED ?? 0} aprobados · ${x.bank.REVIEW ?? 0} por revisar`} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Kpi
            label="Margen de exámenes (peor caso del mes)"
            value={pct(x.examRevenueCents + x.licenseMonthlyCents > 0 ? (x.examRevenueCents + x.licenseMonthlyCents - x.examFeeCents - x.variableAiCostCents) / (x.examRevenueCents + x.licenseMonthlyCents) : null)}
            hint="Ingresos de exámenes y licencias − comisiones − IA y voz por uso"
          />
          <Kpi label="Uso interno del administrador" value={usd(x.internalAiCostCents)} hint={`Costo interno, fuera del margen · por proveedor: ${x.byProvider.map((p) => `${p.provider} ${usd(p.cents)}`).join(" · ")}`} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="font-semibold">Plan de Tavus recomendado</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Con el volumen actual (consumido + vendido pendiente), el plan más económico es{" "}
            <strong className="text-foreground">{m.recommendedTier.nameEs}</strong>
            {m.recommendedTier.id !== m.tavusTier.id ? " — considera cambiar de plan en Tavus y actualizar la configuración." : " (el actual)."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Builder → Growth conviene sobre ~1.140 min/mes o con cola frecuente (3 clases simultáneas). Growth → Business sobre ~3.200 min/mes.
          </p>
          {m.uncollectedSeconds > 0 && (
            <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              ⚠ {m.uncollectedSeconds} s sin cobrar este mes (excesos sobre la reserva). Revisa el margen de seguridad.
            </p>
          )}
        </section>
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="font-semibold">Suscripciones activas · {m.users} usuarios</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {PLANS.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.nameEs}</span>
                <span className="font-semibold tabular-nums">{m.activeSubs.find((s) => s.planId === p.id)?._count ?? 0}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="font-semibold">Margen garantizado por producto</h2>
        <p className="text-sm text-muted-foreground">
          Con el costo actual de ${costs.tavusCostPerMinUsd.toFixed(2)}/min (+5 % de colchón) y comisión de {DEFAULT_COSTS.feePct * 100} % + $0,30,
          suponiendo que el usuario usa el 100 % de sus minutos.
        </p>
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2">Producto</th>
              <th>Precio</th>
              <th>Minutos</th>
              <th className="text-right">Margen mínimo</th>
            </tr>
          </thead>
          <tbody>
            {[...PLANS.map((p) => ({ name: `Plan ${p.nameEs}`, price: p.priceUsdCents, s: p.monthlySeconds, rec: true })), ...TOPUPS.map((t) => ({ name: t.nameEs, price: t.priceUsdCents, s: t.seconds, rec: false }))].map((row) => {
              const mm = worstCaseMargin({ priceUsdCents: row.price, seconds: row.s, recurring: row.rec }, costs);
              return (
                <tr key={row.name} className="border-t">
                  <td className="py-2 font-medium">{row.name}</td>
                  <td>{formatUsd(row.price)}</td>
                  <td>{row.s / 60}</td>
                  <td className={cn("text-right font-semibold tabular-nums", mm.meetsTarget ? "text-[oklch(0.55_0.15_160)]" : "text-destructive")}>
                    {(mm.margin * 100).toFixed(1)} %
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <table className="mt-6 w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2">Producto de examen</th>
              <th>Precio</th>
              <th>Cupos (simulacros · Writing · Speaking)</th>
              <th className="text-right">Margen mínimo</th>
            </tr>
          </thead>
          <tbody>
            {[
              ...EXAM_PRODUCTS.map((p) => ({ name: p.nameEs, price: p.priceUsdCents, q: p.examQuotas!, addon: p.kind === "EXAM_ADDON" })),
              ...ORG_LICENSES.map((l) => ({ name: `${l.nameEs} (por estudiante)`, price: l.priceUsdCents, q: l.examQuotas, addon: false })),
            ].map((row) => {
              const mm = examProductMargin({ priceUsdCents: row.price, quotas: row.q, addon: row.addon });
              return (
                <tr key={row.name} className="border-t">
                  <td className="py-2 font-medium">{row.name}</td>
                  <td>{formatUsd(row.price)}</td>
                  <td>
                    {row.q.MOCK} · {row.q.WRITING} · {row.q.SPEAKING}
                  </td>
                  <td className={cn("text-right font-semibold tabular-nums", mm.meetsTarget ? "text-[oklch(0.55_0.15_160)]" : "text-destructive")}>
                    {(mm.margin * 100).toFixed(1)} %
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
