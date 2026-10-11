"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
  }
}

/**
 * Widget de Cloudflare Turnstile. En local usa la clave de prueba de Cloudflare
 * (siempre pasa). Entrega el token por `onToken`; null si caduca o falla.
 */
export function Turnstile({ onToken, action }: { onToken: (token: string | null) => void; action?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    const tryRender = () => {
      if (cancelled || !ref.current) return;
      if (!window.turnstile) {
        setTimeout(tryRender, 150);
        return;
      }
      if (widgetId.current) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        action,
        theme: "auto",
        language: "es",
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    };
    tryRender();
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, action, onToken]);

  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div ref={ref} className="min-h-[65px]" />
    </>
  );
}
