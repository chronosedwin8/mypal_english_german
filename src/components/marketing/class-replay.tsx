"use client";

import { CheckCircle2Icon, PinIcon } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { AvatarLoop } from "@/components/avatar-loop";

/** Repeticion animada de una clase: asi se siente conversar con Poly. */
type Event =
  | { t: "poly"; text: string }
  | { t: "you"; text: string }
  | { t: "fix"; wrong: string; right: string; why: string }
  | { t: "word"; term: string; es: string };

const SCRIPT: Event[] = [
  { t: "poly", text: "Hi Ana! How was your weekend?" },
  { t: "you", text: "It was great! I go to the beach with my family." },
  { t: "fix", wrong: "I go to the beach", right: "I went to the beach", why: "Fin de semana pasado → pasado simple." },
  { t: "poly", text: "Oh, lovely! You went to the beach. What did you do there?" },
  { t: "you", text: "We swim and… ¿cómo se dice 'castillo de arena'?" },
  { t: "poly", text: "A sandcastle! Did you build a sandcastle?" },
  { t: "word", term: "sandcastle", es: "castillo de arena" },
  { t: "you", text: "Yes! We built a big sandcastle." },
  { t: "poly", text: "Perfect sentence! You used “built” correctly. 👏" },
];

export function ClassReplay() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const [count, setCount] = useState(reduce ? SCRIPT.length : 3);

  useEffect(() => {
    if (!inView || reduce) return;
    const t = setInterval(() => setCount((c) => (c >= SCRIPT.length + 3 ? 3 : c + 1)), 1600);
    return () => clearInterval(t);
  }, [inView, reduce]);

  const shown = SCRIPT.slice(0, Math.min(count, SCRIPT.length));

  return (
    <div ref={ref} className="grid overflow-hidden rounded-[2rem] border bg-card shadow-xl lg:grid-cols-[0.8fr_1.2fr]">
      <div className="relative min-h-64 bg-black">
        <AvatarLoop who="poly" className="absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 text-white">
          <p className="font-heading text-lg font-bold">Poly</p>
          <p className="text-sm text-white/70">Tu tutora · Inglés británico</p>
        </div>
      </div>
      <div className="flex h-[26rem] flex-col justify-end gap-2.5 overflow-hidden p-5 sm:p-6">
        <AnimatePresence initial={false}>
          {shown.map((e, i) => (
            <motion.div
              key={i}
              layout
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3 }}
              className={
                e.t === "you"
                  ? "ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
                  : e.t === "poly"
                    ? "max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-4 py-2 text-sm"
                    : "mx-auto w-full max-w-sm"
              }
            >
              {e.t === "you" ? (
                e.text
              ) : e.t === "poly" ? (
                e.text
              ) : e.t === "fix" ? (
                <div className="flex items-start gap-2 rounded-xl border border-mint/50 bg-mint/10 px-3 py-2 text-xs">
                  <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[oklch(0.55_0.15_160)]" />
                  <span>
                    <span className="text-muted-foreground line-through">{e.wrong}</span> → <strong>{e.right}</strong>
                    <span className="block text-muted-foreground">{e.why}</span>
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-sun/60 bg-sun/15 px-3 py-2 text-xs">
                  <PinIcon className="size-4 text-coral" /> Guardada en tu vocabulario: <strong>{e.term}</strong> · {e.es}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
