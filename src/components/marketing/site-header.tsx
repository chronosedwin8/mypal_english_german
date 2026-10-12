import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";

export const NAV_LINKS = [
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/#vision", label: "Tu tutor te ve" },
  { href: "/#examenes", label: "Exámenes" },
  { href: "/#precios", label: "Precios" },
  { href: "/#preguntas", label: "Preguntas" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/ingresar" className={cn(buttonVariants({ variant: "ghost" }), "hidden h-9 px-3 sm:inline-flex")}>
            Ingresar
          </Link>
          <Link href="/test-de-nivel" className={cn(buttonVariants(), "h-9 rounded-full px-4")}>
            Test gratis
          </Link>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
