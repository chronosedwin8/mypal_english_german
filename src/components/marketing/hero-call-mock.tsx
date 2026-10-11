"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { TutorAvatar } from "./tutor-avatar";
import { Flag } from "@/components/flag";

/** Guion de la demo: el estudiante muestra una taza y el tutor la nombra. */
const SCRIPT = [
  { who: "tutor", text: "Hi Ana! What have you got there? 👀", detect: false },
  { who: "student", text: "It's my… ¿taza?", detect: true },
  { who: "tutor", text: "A mug! ☕ Say it with me: mug.", detect: true },
  { who: "student", text: "Mug! My coffee mug.", detect: true },
  { who: "tutor", text: "Brilliant! In the UK we'd also say “a cuppa”.", detect: false },
] as const;

const STEP_MS = 2800;

export function HeroCallMock() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [seconds, setSeconds] = useState(299);

  useEffect(() => {
    if (reduce) return;
    const a = setInterval(() => setStep((s) => (s + 1) % SCRIPT.length), STEP_MS);
    const b = setInterval(() => setSeconds((s) => (s <= 241 ? 299 : s - 1)), 1000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [reduce]);

  const line = SCRIPT[step];
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="relative mx-auto w-full max-w-[540px]">
      {/* Halo */}
      <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-primary/30 via-coral/20 to-sun/30 blur-2xl" />

      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#2b1f4d] to-[#171129] shadow-2xl shadow-primary/30">
        {/* Barra superior */}
        <div className="flex items-center justify-between px-5 pt-4 text-xs font-medium text-white/80">
          <span className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
            </span>
            En vivo · <Flag code="GB" /> British English
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 font-mono tabular-nums">⏱ {clock}</span>
        </div>

        {/* Tutor */}
        <div className="relative mx-auto mt-2 aspect-[11/10] w-[78%]">
          <div className="absolute inset-x-6 bottom-0 top-8 rounded-full bg-gradient-to-t from-primary/40 to-transparent blur-2xl" />
          <TutorAvatar speaking={line.who === "tutor"} />
        </div>

        {/* Subtitulo */}
        <div className="relative h-24 px-5 pb-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className={
                line.who === "tutor"
                  ? "max-w-[78%] rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 text-sm font-medium text-[#22183d] shadow-lg"
                  : "ml-auto mr-28 max-w-[60%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg sm:mr-32"
              }
            >
              <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider opacity-60">
                {line.who === "tutor" ? "Tutora" : "Tú"}
              </span>
              {line.text}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Camara del estudiante con deteccion */}
        <div className="absolute bottom-4 right-4 h-28 w-24 overflow-hidden rounded-2xl border-2 border-white/20 bg-gradient-to-b from-[#f3e6d8] to-[#e5d2bf] shadow-xl sm:h-32 sm:w-28">
          <svg viewBox="0 0 112 128" className="h-full w-full" aria-hidden="true">
            <circle cx="56" cy="44" r="20" fill="#c98b62" />
            <path d="M44 34c2-14 22-18 28-4-8-2-18 0-28 4Z" fill="#2e2233" />
            <path d="M18 128c2-28 18-42 38-42s36 14 38 42Z" fill="var(--sky)" />
            {/* Taza */}
            <rect x="62" y="80" width="22" height="24" rx="4" fill="white" />
            <path d="M84 86c8 0 8 12 0 12" stroke="white" strokeWidth="4" fill="none" />
            <path d="M66 78c2-5-2-7 0-11M74 78c2-5-2-7 0-11" stroke="#c9b8a6" strokeWidth="2" fill="none" />
            <circle cx="50" cy="96" r="7" fill="#c98b62" />
          </svg>
          <AnimatePresence>
            {line.detect && (
              <motion.div
                initial={{ opacity: 0, scale: 1.25 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute left-[52%] top-[55%] h-[24%] w-[32%] rounded-md border-2 border-sun"
              >
                <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-sun px-1 text-[9px] font-bold text-[#3a2a00]">
                  mug · 98%
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Chips flotantes */}
      <motion.div
        className="absolute -left-3 top-16 hidden rounded-2xl border bg-card px-3 py-2 text-xs font-semibold shadow-lg sm:block"
        animate={reduce ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity }}
      >
        👀 Ve lo que le muestras
      </motion.div>
      <motion.div
        className="absolute -right-4 top-1/3 hidden rounded-2xl border bg-card px-3 py-2 text-xs font-semibold shadow-lg sm:block"
        animate={reduce ? undefined : { y: [0, 6, 0] }}
        transition={{ duration: 6, repeat: Infinity }}
      >
        ✅ Corrige con paciencia
      </motion.div>
      <motion.div
        className="absolute -bottom-4 left-8 hidden rounded-2xl border bg-card px-3 py-2 text-xs font-semibold shadow-lg sm:block"
        animate={reduce ? undefined : { y: [0, -5, 0] }}
        transition={{ duration: 4.5, repeat: Infinity }}
      >
        <Flag code="DE" /> die Tasse · <Flag code="US" /> mug · <Flag code="GB" /> cuppa
      </motion.div>
    </div>
  );
}
