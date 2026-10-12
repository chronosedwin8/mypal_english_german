"use client";

import { ClockIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

function format(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Reloj del examen. La hora limite viene del servidor; se corrige la diferencia entre
 * el reloj del navegador y el del servidor. Solo muestra: el servidor es quien cierra.
 */
export function ExamTimer({ deadlineAt, serverNow, onExpire }: { deadlineAt: string; serverNow: string; onExpire: () => void }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const expireRef = useRef(onExpire);
  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const offset = new Date(serverNow).getTime() - Date.now();
    const deadline = new Date(deadlineAt).getTime();
    let fired = false;
    const tick = () => {
      const left = deadline - (Date.now() + offset);
      setRemaining(left);
      if (left <= 0 && !fired) {
        fired = true;
        expireRef.current();
      }
    };
    const id = setInterval(tick, 500);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [deadlineAt, serverNow]);

  const low = remaining !== null && remaining < 5 * 60_000;
  return (
    <span
      role="timer"
      aria-label="Tiempo restante"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-sm font-semibold tabular-nums",
        low ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200" : "bg-background",
      )}
    >
      <ClockIcon className="size-4" />
      {remaining === null ? "--:--" : format(remaining)}
    </span>
  );
}
