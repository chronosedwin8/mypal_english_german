import Link from "next/link";

import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-muted-foreground">
            Tu tutor de idiomas por video. Inglés americano, británico y alemán.
          </p>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold">Aprende</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link href="/test-de-nivel" className="hover:text-foreground">Test de nivel gratis</Link></li>
            <li><Link href="/#precios" className="hover:text-foreground">Precios</Link></li>
            <li><Link href="/#como-funciona" className="hover:text-foreground">Cómo funciona</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold">Cuenta</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link href="/registro" className="hover:text-foreground">Crear cuenta</Link></li>
            <li><Link href="/ingresar" className="hover:text-foreground">Ingresar</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold">Legal</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link href="/legal/privacidad" className="hover:text-foreground">Privacidad</Link></li>
            <li><Link href="/legal/terminos" className="hover:text-foreground">Términos</Link></li>
          </ul>
        </div>
      </div>
      <p className="pb-8 text-center text-xs text-muted-foreground">
        © {2026} MyPAL · Tutor de inteligencia artificial. No reemplaza certificaciones oficiales.
      </p>
    </footer>
  );
}
