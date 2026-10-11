import Link from "next/link";

import { cn } from "@/lib/utils";

/** Marca: burbuja de dialogo con un "ojo" (el tutor te escucha y te ve). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={cn("size-8", className)}>
      <defs>
        <linearGradient id="mypal-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--coral)" />
        </linearGradient>
      </defs>
      <path
        d="M20 3c9.4 0 17 6.7 17 15s-7.6 15-17 15c-1.7 0-3.3-.2-4.9-.6L7 36.5l1.6-7.3C5.1 26.5 3 22.4 3 18 3 9.7 10.6 3 20 3Z"
        fill="url(#mypal-mark)"
      />
      <ellipse cx="20" cy="18" rx="8.5" ry="6" fill="white" />
      <circle cx="20" cy="18" r="3.6" fill="var(--primary)" />
      <circle cx="21.3" cy="16.7" r="1.2" fill="white" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-heading text-xl font-extrabold tracking-tight", className)}>
      <LogoMark />
      <span>
        My<span className="text-primary">PAL</span>
      </span>
    </Link>
  );
}
