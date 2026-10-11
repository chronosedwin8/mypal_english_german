import { CreditCardIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMinutes, formatUsd } from "@/lib/pricing/catalog";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/dal";
import { fakePayments } from "@/server/payments/fake-provider";

import { confirmFakePayment } from "../planes/actions";

export const metadata = { title: "Pago" };

/** Checkout SIMULADO: no se cobra dinero real. Se reemplaza al conectar la pasarela. */
export default function FakeCheckoutPage({ searchParams }: PageProps<"/app/pagar">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-80 max-w-md rounded-3xl" />}>
      <Checkout searchParams={searchParams} />
    </Suspense>
  );
}

async function Checkout({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/app/planes");
  const sp = await searchParams;
  const ref = typeof sp.ref === "string" ? sp.ref : "";
  const sig = typeof sp.sig === "string" ? sp.sig : "";
  const parsed = fakePayments.parseCheckout(ref, sig, user.id);
  if (!parsed) {
    return (
      <div className="mx-auto max-w-md pt-10 text-center">
        <p className="font-semibold">Este enlace de pago no es válido o expiró.</p>
        <Link href="/app/planes" className={cn(buttonVariants(), "mt-4 rounded-full")}>Volver a planes</Link>
      </div>
    );
  }
  const { item, kind } = parsed;
  const seconds = "monthlySeconds" in item ? item.monthlySeconds : item.seconds;

  return (
    <div className="mx-auto max-w-md pt-6">
      <div className="rounded-3xl border bg-card p-8 shadow-lg">
        <span className="rounded-full bg-sun/40 px-3 py-1 text-xs font-bold">MODO DE PRUEBA · sin cobro real</span>
        <h1 className="mt-4 font-heading text-2xl font-extrabold">Confirmar compra</h1>
        <div className="mt-6 rounded-2xl bg-muted/60 p-4">
          <p className="font-semibold">{kind === "plan" ? `Plan ${item.nameEs}` : item.nameEs}</p>
          <p className="text-sm text-muted-foreground">
            {formatMinutes(seconds)} con tu tutora {kind === "plan" ? "cada mes" : "· válida 90 días"}
          </p>
          <p className="mt-3 font-heading text-3xl font-extrabold">
            {formatUsd(item.priceUsdCents)}
            {kind === "plan" && <span className="text-base font-normal text-muted-foreground">/mes</span>}
          </p>
        </div>
        <form action={confirmFakePayment} className="mt-6">
          <input type="hidden" name="ref" value={ref} />
          <input type="hidden" name="sig" value={sig} />
          <Button className="h-12 w-full rounded-full text-base">
            <CreditCardIcon /> Pagar (simulado)
          </Button>
        </form>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheckIcon className="size-3.5" /> Aquí irá la pasarela real (Stripe, Mercado Pago o Wompi).
        </p>
      </div>
    </div>
  );
}
