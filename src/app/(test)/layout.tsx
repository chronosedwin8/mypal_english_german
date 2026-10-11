import Link from "next/link";

import { Logo } from "@/components/marketing/logo";

export default function FocusedLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-secondary/50 to-background">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-5">
        <Logo />
        <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Salir
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16">{children}</main>
    </div>
  );
}
