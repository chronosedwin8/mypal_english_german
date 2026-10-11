import { Suspense } from "react";

import { AppNav } from "@/components/app/app-nav";
import { MinutesPill } from "@/components/app/minutes-pill";
import { UserMenu } from "@/components/app/user-menu";
import { Logo } from "@/components/marketing/logo";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-secondary/40 to-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Logo href="/app" />
          <Suspense fallback={<AppNav static />}>
            <AppNav />
          </Suspense>
          <div className="ml-auto flex items-center gap-2">
            <Suspense fallback={<Skeleton className="h-8 w-28 rounded-full" />}>
              <MinutesPill />
            </Suspense>
            <Suspense fallback={<Skeleton className="size-9 rounded-full" />}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
