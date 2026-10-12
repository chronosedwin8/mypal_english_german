import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/marketing/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { requireStaff } from "@/server/auth/dal";

const NAV = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/en-vivo", label: "En vivo" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/examenes", label: "Exámenes" },
  { href: "/admin/instituciones", label: "Instituciones" },
  { href: "/admin/accesos", label: "Accesos" },
  { href: "/admin/moderacion", label: "Moderación" },
  { href: "/admin/costos", label: "Costos" },
  { href: "/admin/auditoria", label: "Auditoría" },
  { href: "/admin/configuracion", label: "Configuración" },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Logo href="/admin" />
          <span className="shrink-0 rounded bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">ADMIN</span>
          <nav className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-2.5 py-1.5 font-medium hover:bg-muted">
                {n.label}
              </Link>
            ))}
          </nav>
          <Link href="/app" className="shrink-0 whitespace-nowrap text-sm text-muted-foreground hover:text-foreground">
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
  const user = await requireStaff();
  return (
    <>
      {user.role === "SUPPORT" && (
        <p className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Modo soporte: solo lectura. Los cambios los hace un administrador.
        </p>
      )}
      {children}
    </>
  );
}
