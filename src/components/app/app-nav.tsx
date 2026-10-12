"use client";

import { BookOpenIcon, GraduationCapIcon, HomeIcon, SparklesIcon, VideoIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/app", label: "Inicio", icon: HomeIcon, exact: true },
  { href: "/app/practicar", label: "Practicar", icon: VideoIcon },
  { href: "/app/examenes", label: "Exámenes", icon: GraduationCapIcon },
  { href: "/app/vocabulario", label: "Vocabulario", icon: BookOpenIcon },
  { href: "/app/planes", label: "Planes", icon: SparklesIcon },
];

export function AppNav(props: { static?: boolean }) {
  return props.static ? <Nav path="" /> : <ActiveNav />;
}

function ActiveNav() {
  return <Nav path={usePathname()} />;
}

function Nav({ path }: { path: string }) {
  return (
    <nav aria-label="Aplicación" className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t bg-background/95 py-1 backdrop-blur md:static md:ml-4 md:justify-start md:gap-1 md:border-0 md:bg-transparent md:py-0">
      {ITEMS.map((item) => {
        const active = item.exact ? path === item.href : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors md:flex-row md:gap-2 md:text-sm",
              active ? "text-primary md:bg-secondary" : "hover:text-foreground",
            )}
          >
            <item.icon className="size-5 md:size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
