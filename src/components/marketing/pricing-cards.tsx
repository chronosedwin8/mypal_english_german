import { CheckIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { PLANS, TOPUPS, formatUsd } from "@/lib/pricing/catalog";
import { cn } from "@/lib/utils";

/** Tarjetas de precios: claras y sin exceso de informacion. */
export function PricingCards({ ctaHref = "/registro" }: { ctaHref?: string }) {
  const cheapestTopup = Math.min(...TOPUPS.map((t) => t.priceUsdCents));
  return (
    <div>
      <div className="grid gap-6 md:grid-cols-3 md:items-stretch">
        {PLANS.map((plan) => {
          const classes = Math.floor(plan.monthlySeconds / plan.perSessionCapSeconds);
          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-3xl border bg-card p-7 shadow-sm",
                plan.highlight && "border-primary shadow-xl shadow-primary/15 ring-2 ring-primary md:-my-3 md:py-10",
              )}
            >
              {plan.highlight && (
                <span className="absolute -top-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                  <SparklesIcon className="size-3.5" /> Más popular
                </span>
              )}
              <h3 className="font-heading text-xl font-bold">{plan.nameEs}</h3>
              <p className="text-sm text-muted-foreground">{plan.taglineEs}</p>
              <p className="mt-5 flex items-baseline gap-1">
                <span className="font-heading text-5xl font-extrabold tracking-tight">{formatUsd(plan.priceUsdCents)}</span>
                <span className="text-muted-foreground">/mes</span>
              </p>
              <p className="mt-2 text-sm font-semibold text-primary">
                {plan.monthlySeconds / 60} min con tu tutor · ≈ {classes} clases
              </p>
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-mint" strokeWidth={3} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`${ctaHref}?plan=${plan.id}`}
                className={cn(
                  buttonVariants({ variant: plan.highlight ? "default" : "outline" }),
                  "mt-8 h-11 rounded-full text-base",
                )}
              >
                Elegir {plan.nameEs}
              </Link>
            </div>
          );
        })}
      </div>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        ¿Necesitas más? Recargas desde {formatUsd(cheapestTopup)}. Precios en USD · Cancela cuando quieras.
      </p>
    </div>
  );
}
