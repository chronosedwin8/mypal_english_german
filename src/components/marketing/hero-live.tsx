"use client";

import { ArrowRightIcon, CameraIcon, EyeIcon, Loader2Icon, SparklesIcon, XIcon, ZapIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AvatarLoop } from "@/components/avatar-loop";
import { Flag } from "@/components/flag";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useObjectDetection } from "./use-object-detection";
import { POLY_LINES, VISION_WORDS, type DemoLang } from "./vision-words";

const LANGS: { id: DemoLang; flag: "US" | "GB" | "DE"; label: string }[] = [
  { id: "us", flag: "US", label: "EE. UU." },
  { id: "uk", flag: "GB", label: "Reino Unido" },
  { id: "de", flag: "DE", label: "Alemán" },
];

function Waveform({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-mint"
          animate={active && !reduce ? { height: ["30%", "100%", "45%", "85%", "30%"] } : { height: "30%" }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12 }}
        />
      ))}
    </span>
  );
}

export function HeroLive() {
  const [lang, setLang] = useState<DemoLang>("uk");
  const [introStep, setIntroStep] = useState(0);
  const [focus, setFocus] = useState<{ label: string; at: number } | null>(null);
  const [learned, setLearned] = useState<string[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const camBoxRef = useRef<HTMLDivElement | null>(null);
  const { videoRef, videoSize, status, detections, start, stop } = useObjectDetection();
  const cameraOn = status === "on" || status === "loading-model" || status === "starting";

  // Guion de bienvenida mientras la camara esta apagada.
  useEffect(() => {
    if (cameraOn) return;
    const t = setInterval(() => setIntroStep((s) => (s + 1) % POLY_LINES[lang].intro.length), 3800);
    return () => clearInterval(t);
  }, [cameraOn, lang]);

  // Objeto en foco: el mejor (sin personas) que tengamos traducido.
  const best = useMemo(
    () =>
      detections
        .filter((d) => d.label !== "person" && VISION_WORDS[d.label])
        .sort((a, b) => b.score - a.score)[0] ?? null,
    [detections],
  );
  const seesPerson = detections.some((d) => d.label === "person");

  useEffect(() => {
    if (!best || best.score < 0.55) return;
    const now = Date.now();
    if (focus?.label === best.label || (focus && now - focus.at < 1800)) return;
    const t = setTimeout(() => {
      setFocus({ label: best.label, at: Date.now() });
      setLearned((l) => (l.includes(best.label) ? l : [...l, best.label].slice(-6)));
    }, 0);
    return () => clearTimeout(t);
  }, [best, focus]);

  // Tamaño del panel de camara para ubicar las cajas.
  useEffect(() => {
    const el = camBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [cameraOn]);

  const lines = POLY_LINES[lang];
  let caption: { text: string; es: string; key: string };
  if (!cameraOn) {
    const l = lines.intro[introStep];
    caption = { ...l, key: `intro-${lang}-${introStep}` };
  } else if (status !== "on") {
    caption = { text: "One second… I'm opening my eyes!", es: "Un momento… estoy abriendo los ojos 👀", key: "loading" };
  } else if (focus && VISION_WORDS[focus.label]) {
    const w = VISION_WORDS[focus.label];
    caption = { text: lines.react(w[lang]), es: `Es ${w.es === "tijeras" ? "unas tijeras" : `un(a) ${w.es}`}.`, key: `obj-${lang}-${focus.label}` };
  } else {
    caption = {
      text: seesPerson ? lines.noObject : lines.intro[1].text,
      es: "Levanta un objeto frente a la cámara: una taza, un libro, tu celular…",
      key: `wait-${lang}-${seesPerson}`,
    };
  }

  // Proyeccion de cajas sobre un video "object-cover" espejado.
  const vw = videoSize.w;
  const vh = videoSize.h;
  const scale = Math.max(box.w / vw, box.h / vh) || 1;
  const offX = (box.w - vw * scale) / 2;
  const offY = (box.h - vh * scale) / 2;

  return (
    <section className="relative overflow-hidden bg-[#0c0918] text-white">
      {/* Fondo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-0 size-[38rem] rounded-full bg-primary/30 blur-[120px]" />
        <div className="absolute -right-40 bottom-0 size-[34rem] rounded-full bg-coral/20 blur-[120px]" />
        <div className="absolute inset-0 bg-grid opacity-[0.07]" />
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-14 lg:grid-cols-[0.9fr_1.1fr] lg:pt-20">
        {/* Texto */}
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium backdrop-blur">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-mint" />
            </span>
            Video en tiempo real · <Flag code="US" /> <Flag code="GB" /> <Flag code="DE" />
          </span>
          <h1 className="mt-6 font-heading text-4xl font-extrabold leading-[1.04] tracking-tight text-balance sm:text-5xl xl:text-[3.6rem]">
            Habla inglés y alemán con una tutora que{" "}
            <span className="bg-gradient-to-r from-[oklch(0.78_0.15_300)] via-coral to-sun bg-clip-text text-transparent">
              te ve, te escucha y te responde
            </span>{" "}
            como una persona real.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70 text-balance">
            Conoce a Poly: conversa con ella por video, muéstrale cualquier cosa a tu cámara y pregúntale cómo se dice. Te
            corrige con paciencia, recuerda tus clases y se adapta a tu nivel.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/test-de-nivel" className={cn(buttonVariants(), "h-12 rounded-full px-6 text-base shadow-lg shadow-primary/40")}>
              Haz tu test de nivel gratis <ArrowRightIcon />
            </Link>
            <button
              onClick={() => (cameraOn ? stop() : start())}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 text-base font-medium backdrop-blur transition-colors hover:bg-white/10"
            >
              <CameraIcon className="size-5" /> {cameraOn ? "Apagar la cámara" : "Pruébalo con tu cámara"}
            </button>
          </div>
          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="flex items-center gap-1.5 text-white/60"><ZapIcon className="size-4 text-sun" /> Responde</dt>
              <dd className="mt-1 font-heading text-xl font-bold">al instante</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-white/60"><EyeIcon className="size-4 text-sky" /> Ve tu</dt>
              <dd className="mt-1 font-heading text-xl font-bold">cámara</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-white/60"><SparklesIcon className="size-4 text-coral" /> Disponible</dt>
              <dd className="mt-1 font-heading text-xl font-bold">24/7</dd>
            </div>
          </dl>
        </div>

        {/* Llamada */}
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div role="tablist" aria-label="Acento" className="flex gap-1 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  role="tab"
                  aria-selected={lang === l.id}
                  onClick={() => setLang(l.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm",
                    lang === l.id ? "bg-white text-[#1b1433]" : "text-white/70 hover:text-white",
                  )}
                >
                  <Flag code={l.flag} /> {l.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-white/50">Vista previa · el avatar real de MyPAL</span>
          </div>

          <div className="relative aspect-[16/11] overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl shadow-primary/30 ring-1 ring-white/5">
            <AvatarLoop who="poly" className="absolute inset-0" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />

            {/* Barra superior */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 text-xs font-medium sm:text-sm">
              <span className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur">
                <span className="size-2 rounded-full bg-red-500" /> En vivo con Poly <Waveform active />
              </span>
              <span className="rounded-full bg-black/40 px-3 py-1.5 font-mono backdrop-blur">⏱ 14:32</span>
            </div>

            {/* Subtitulo */}
            <div className="absolute bottom-4 left-4 right-4 sm:right-[44%]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={caption.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3 }}
                  className="w-fit max-w-full rounded-2xl rounded-bl-sm bg-white/95 px-4 py-2.5 text-[#1b1433] shadow-xl"
                >
                  <p className="text-sm font-semibold sm:text-base">{caption.text}</p>
                  <p className="mt-0.5 text-xs text-[#6b6385]">{caption.es}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Tu camara */}
            <div
              ref={camBoxRef}
              className={cn(
                "absolute overflow-hidden rounded-2xl border-2 border-white/25 bg-[#1b1433]/80 shadow-2xl backdrop-blur transition-all duration-500",
                cameraOn ? "bottom-4 right-4 h-[46%] w-[40%]" : "bottom-4 right-4 hidden h-28 w-44 sm:block",
              )}
            >
              <video ref={videoRef} muted playsInline className={cn("h-full w-full -scale-x-100 object-cover", !cameraOn && "hidden")} />
              {!cameraOn && (
                <button
                  onClick={start}
                  className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3 text-center text-xs font-semibold text-white/90 hover:bg-white/5"
                >
                  <CameraIcon className="size-6 text-sun" />
                  Muéstrale un objeto a Poly
                </button>
              )}
              {cameraOn && status !== "on" && (
                <div className="absolute inset-0 grid place-items-center bg-black/50 text-xs">
                  <span className="flex items-center gap-2"><Loader2Icon className="size-4 animate-spin" /> Activando visión…</span>
                </div>
              )}
              {status === "on" &&
                detections
                  .filter((d) => d.label !== "person" && VISION_WORDS[d.label])
                  .map((d, i) => {
                    const [x, y, w, h] = d.box;
                    const left = box.w - (x * scale + offX) - w * scale;
                    return (
                      <div
                        key={`${d.label}-${i}`}
                        className="absolute rounded-md border-2 border-sun"
                        style={{ left, top: y * scale + offY, width: w * scale, height: h * scale }}
                      >
                        <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-sun px-1 text-[10px] font-bold text-[#3a2a00]">
                          {VISION_WORDS[d.label][lang]}
                        </span>
                      </div>
                    );
                  })}
              {cameraOn && (
                <button
                  onClick={stop}
                  aria-label="Apagar cámara"
                  className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Estado de la demo */}
          <div className="mt-4 min-h-[44px]">
            {status === "denied" && (
              <p className="text-sm text-coral">No pudimos usar tu cámara. Revisa el permiso del navegador e inténtalo otra vez.</p>
            )}
            {status === "error" && <p className="text-sm text-coral">Tu navegador no pudo cargar la visión. Prueba con Chrome o Edge.</p>}
            {learned.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-white/60">Palabras de hoy:</span>
                {learned.map((l) => (
                  <motion.span
                    key={l}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="rounded-full bg-white/10 px-3 py-1 font-semibold"
                  >
                    {VISION_WORDS[l][lang]} <span className="font-normal text-white/50">· {VISION_WORDS[l].es}</span>
                  </motion.span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/50">
                🔒 La demo de visión funciona dentro de tu navegador: no grabamos ni enviamos tu imagen.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
