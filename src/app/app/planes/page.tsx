import { CheckIcon, SparklesIcon } from "lucide-react";
import { Suspense } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PLANS, TOPUPS, formatMinutes, formatUsd } from "@/lib/pricing/catalog";
import { cn } from "@/lib/utils";
import { accountSummary } from "@/server/app-data";
import { requireUser } from "@/server/auth/dal";

import { cancelSubscription, startCheckout } from "./actions";

export const metadata = { title: "Planes" };

const NOTICES: Record<string, string> = {
  "sin-minutos": "No tienes minutos disponibles. Elige un plan o una recarga para seguir.",
  "recarga-sin-plan": "Las recargas son para quienes ya tienen un plan activo.",
  "pago-invalido": "El enlace de pago no es válido o expiró. Inténtalo de nuevo.",
};

export default function PlansPage({ searchParams }: PageProps<"/app/planes">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
      <Plans searchParams={searchParams} />
    </Suspense>
  );
}

async function Plans({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/app/planes");
  const sp = await searchParams;
  const acc = await accountSummary(user.id);
  const sub = acc.subscription;
  const notice = typeof sp.motivo === "string" ? NOTICES[sp.motivo] : null;

  return (
    <div className="space-y-10 pb-16 md:pb-0">
      <div>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Planes y minutos</h1>
        <p className="mt-1 text-muted-foreground">
          Tienes <strong className="text-foreground">{formatMinutes(acc.balance.paidAvailableSeconds)}</strong> disponibles con tu tutora.
        </p>
      </div>

      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {sp.pagado && (
        <Alert className="border-mint bg-mint/15">
          <AlertDescription>✅ ¡Pago confirmado! Tus minutos ya están disponibles.</AlertDescription>
        </Alert>
      )}
      {sp.cancelado && (
        <Alert>
          <AlertDescription>Tu plan no se renovará. Conservas tus minutos hasta el final del periodo.</AlertDescription>
        </Alert>
      )}

      {sub && (
        <section className="flex flex-col justify-between gap-4 rounded-3xl border bg-card p-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm text-muted-foreground">Tu plan actual</p>
            <p className="font-heading text-2xl font-bold">{sub.plan.nameEs}</p>
            <p className="text-sm text-muted-foreground">
              {sub.cancelAtPeriodEnd ? "Termina" : "Se renueva"} el {sub.currentPeriodEnd.toLocaleDateString("es", { day: "numeric", month: "long" })}
            </p>
          </div>
          {!sub.cancelAtPeriodEnd && (
            <form action={cancelSubscription}>
              <Button variant="outline" className="rounded-full">Cancelar renovación</Button>
            </form>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-6 font-heading text-xl font-bold">{sub ? "Cambiar de plan" : "Elige tu plan"}</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const current = sub?.planId === plan.id;
            return (
              <div
                key={plan.id}
                className={cn("relative flex flex-col rounded-3xl border bg-card p-6", plan.highlight && "border-primary ring-2 ring-primary")}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-0.5 text-xs font-bold text-primary-foreground">
                    <SparklesIcon className="size-3" /> Más popular
                  </span>
                )}
                <p className="font-heading text-xl font-bold">{plan.nameEs}</p>
                <p className="mt-3">
                  <span className="font-heading text-4xl font-extrabold">{formatUsd(plan.priceUsdCents)}</span>
                  <span className="text-muted-foreground">/mes</span>
                </p>
                <p className="text-sm font-semibold text-primary">{plan.monthlySeconds / 60} min con tu tutora</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-mint" strokeWidth={3} /> {f}
                    </li>
                  ))}
                </ul>
                <form action={startCheckout} className="mt-6">
                  <input type="hidden" name="kind" value="plan" />
                  <input type="hidden" name="itemId" value={plan.id} />
                  <Button className="h-11 w-full rounded-full" variant={plan.highlight ? "default" : "outline"} disabled={current}>
                    {current ? "Tu plan actual" : `Elegir ${plan.nameEs}`}
                  </Button>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-heading text-xl font-bold">Recargas</h2>
        <p className="text-sm text-muted-foreground">
          {sub ? "Minutos extra que duran 90 días." : "Disponibles cuando tengas un plan activo."}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {TOPUPS.map((t) => (
            <form key={t.id} action={startCheckout} className="flex items-center justify-between rounded-2xl border bg-card p-5">
              <input type="hidden" name="kind" value="topup" />
              <input type="hidden" name="itemId" value={t.id} />
              <div>
                <p className="font-semibold">{t.nameEs}</p>
                <p className="text-sm text-muted-foreground">{formatUsd(t.priceUsdCents)} · válida {t.validityDays} días</p>
              </div>
              <Button variant="outline" className="rounded-full" disabled={!sub}>
                Comprar
              </Button>
            </form>
          ))}
        </div>
      </section>
      <p className="text-xs text-muted-foreground">Precios en USD. Los minutos del plan se renuevan cada mes y no se acumulan.</p>
    </div>
  );
}
