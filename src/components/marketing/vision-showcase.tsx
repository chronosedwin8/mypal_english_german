"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Flag } from "@/components/flag";

type Lang = "us" | "uk" | "de";

const TABS: { id: Lang; label: string; flag: "US" | "GB" | "DE" }[] = [
  { id: "us", label: "Inglés US", flag: "US" },
  { id: "uk", label: "Inglés UK", flag: "GB" },
  { id: "de", label: "Alemán", flag: "DE" },
];

/** Objetos del cuarto ilustrado y como se dicen en cada variante. */
const OBJECTS: {
  id: string;
  box: { left: string; top: string; width: string; height: string };
  words: Record<Lang, string>;
}[] = [
  { id: "lamp", box: { left: "6%", top: "18%", width: "20%", height: "42%" }, words: { us: "lamp", uk: "lamp", de: "die Lampe" } },
  { id: "phone", box: { left: "34%", top: "56%", width: "12%", height: "14%" }, words: { us: "cell phone", uk: "mobile phone", de: "das Handy" } },
  { id: "mug", box: { left: "50%", top: "52%", width: "11%", height: "17%" }, words: { us: "mug", uk: "mug", de: "die Tasse" } },
  { id: "plant", box: { left: "72%", top: "14%", width: "20%", height: "34%" }, words: { us: "plant", uk: "plant", de: "die Pflanze" } },
  { id: "trash", box: { left: "80%", top: "70%", width: "14%", height: "24%" }, words: { us: "trash can", uk: "bin", de: "der Mülleimer" } },
  { id: "sweater", box: { left: "8%", top: "70%", width: "22%", height: "22%" }, words: { us: "sweater", uk: "jumper", de: "der Pullover" } },
];

export function VisionShowcase() {
  const [lang, setLang] = useState<Lang>("uk");
  return (
    <div className="mx-auto w-full max-w-xl">
      <div role="tablist" aria-label="Variante del idioma" className="mb-4 flex flex-wrap justify-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={lang === t.id}
            onClick={() => setLang(t.id)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
              lang === t.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            <Flag code={t.flag} /> {t.label}
          </button>
        ))}
      </div>

      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border bg-gradient-to-b from-[#fbeee0] to-[#f1dcc5] shadow-xl dark:from-[#3a2f45] dark:to-[#2a2236]">
        {/* Cuarto ilustrado */}
        <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <rect x="0" y="200" width="400" height="100" fill="#d8b894" opacity="0.6" />
          <rect x="250" y="40" width="70" height="56" rx="6" fill="#bfe0f2" stroke="#fff" strokeWidth="5" />
          {/* Mesa */}
          <rect x="110" y="196" width="190" height="12" rx="4" fill="#8a5a3c" />
          <rect x="124" y="208" width="10" height="70" fill="#7a4e33" />
          <rect x="276" y="208" width="10" height="70" fill="#7a4e33" />
          {/* Lampara */}
          <path d="M40 60h60l-14 50H54Z" fill="var(--sun)" />
          <rect x="66" y="110" width="8" height="70" fill="#5c4a63" />
          <rect x="48" y="178" width="44" height="8" rx="4" fill="#5c4a63" />
          {/* Telefono */}
          <rect x="142" y="172" width="30" height="22" rx="4" fill="#2a2440" />
          <rect x="146" y="175" width="22" height="16" rx="2" fill="#7c6cf0" />
          {/* Taza */}
          <rect x="204" y="160" width="30" height="34" rx="6" fill="white" />
          <path d="M234 168c12 0 12 18 0 18" stroke="white" strokeWidth="6" fill="none" />
          {/* Planta */}
          <rect x="304" y="120" width="44" height="30" rx="6" fill="var(--coral)" />
          <path d="M326 120c-20-30-10-60 0-70 10 10 20 40 0 70Z" fill="var(--mint)" />
          <path d="M326 120c-30-10-40-30-38-44 16 4 34 20 38 44Z" fill="var(--mint)" opacity="0.8" />
          <path d="M326 120c30-12 38-30 36-44-16 6-32 22-36 44Z" fill="var(--mint)" opacity="0.8" />
          {/* Papelera */}
          <path d="M326 216h44l-6 64h-32Z" fill="#9aa3b5" />
          {/* Sueter doblado */}
          <rect x="34" y="216" width="86" height="58" rx="10" fill="var(--primary)" opacity="0.85" />
          <path d="M34 236h86" stroke="white" strokeWidth="3" opacity="0.5" />
        </svg>

        {/* Cajas de deteccion */}
        {OBJECTS.map((o, i) => (
          <motion.div
            key={o.id}
            className="absolute rounded-lg border-2 border-primary/90 bg-primary/5"
            style={o.box}
            initial={{ opacity: 0, scale: 1.15 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 * i }}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={lang}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute -top-6 left-0 whitespace-nowrap rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground shadow"
              >
                {o.words[lang]}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
      <p className="mt-3 text-center text-sm text-muted-foreground">
        Cambia de variante: <strong>cell phone</strong> en EE. UU. es <strong>mobile phone</strong> en Reino Unido.
      </p>
    </div>
  );
}
