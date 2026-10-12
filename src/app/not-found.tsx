import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="font-heading text-7xl font-extrabold text-primary">404</p>
      <h1 className="mt-4 font-heading text-3xl font-extrabold tracking-tight">No encontramos esta página</h1>
      <p className="mt-2 text-muted-foreground">Puede que el enlace esté mal escrito o que la página ya no exista.</p>
      <Link href="/" className={cn(buttonVariants(), "mt-8 rounded-full")}>
        Volver al inicio
      </Link>
    </main>
  );
}
