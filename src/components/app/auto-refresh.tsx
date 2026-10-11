"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refresca la pagina del servidor cada N ms (p. ej. mientras se liquida una clase). */
export function AutoRefresh({ everyMs }: { everyMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return null;
}
