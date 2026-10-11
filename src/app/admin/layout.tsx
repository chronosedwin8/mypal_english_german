import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/marketing/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/server/auth/dal";

const NAV = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/en-vivo", label: "En vivo" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/configuracion", label: "Configuración" },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Logo href="/admin" />
          <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">ADMIN</span>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 font-medium hover:bg-muted">
                {n.label}
              </Link>
            ))}
          </nav>
          <Link href="/app" className="ml-auto text-sm text-muted-foreground hover:text-foreground">
            Ir a la app
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
          <Guard>{children}</Guard>
        </Suspense>
      </main>
    </div>
  );
}

async function Guard({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
