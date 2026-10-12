import Link from "next/link";

import { Logo } from "@/components/marketing/logo";

export default function TeacherLayout({ children }: LayoutProps<"/docente">) {
  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Logo href="/docente" />
          <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">DOCENTE</span>
          <Link href="/docente" className="text-sm font-medium hover:underline">
            Mis grupos
          </Link>
          <Link href="/institucion" className="ml-auto text-sm text-muted-foreground hover:text-foreground">
            Institución
          </Link>
          <Link href="/app" className="text-sm text-muted-foreground hover:text-foreground">
            Ir a la app
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
