"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/#vision", label: "Tu tutor te ve" },
  { href: "/#precios", label: "Precios" },
  { href: "/#preguntas", label: "Preguntas" },
  { href: "/ingresar", label: "Ingresar" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "md:hidden")}
        aria-label="Abrir menú"
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle>Menú</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4" aria-label="Menú móvil">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-3 text-base font-medium hover:bg-muted"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/test-de-nivel"
            onClick={() => setOpen(false)}
            className={cn(buttonVariants(), "mt-3 h-11 rounded-full")}
          >
            Haz tu test gratis
          </Link>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
