import {
  ArrowRightIcon,
  BrainIcon,
  CameraIcon,
  ClipboardCheckIcon,
  MessageCircleHeartIcon,
  RepeatIcon,
  SparklesIcon,
  VideoIcon,
} from "lucide-react";
import Link from "next/link";

import { Faq } from "@/components/marketing/faq";
import { HeroCallMock } from "@/components/marketing/hero-call-mock";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { VisionShowcase } from "@/components/marketing/vision-showcase";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Flag } from "@/components/flag";

const STEPS = [
  {
    icon: ClipboardCheckIcon,
    title: "Test de nivel gratis",
    text: "Sin registro. Escucha voces nativas, responde y habla: en unos minutos sabes tu nivel (A1–C1).",
    color: "bg-sky/30",
  },
  {
    icon: VideoIcon,
    title: "5 minutos con tu tutor",
    text: "Crea tu cuenta y vive una clase real por video. Tu tutor te habla, te escucha y te ve.",
    color: "bg-coral/20",
  },
  {
    icon: SparklesIcon,
    title: "Elige tu ritmo",
    text: "Planes desde $25 al mes. Practica a cualquier hora, sin agendar y sin vergüenza a equivocarte.",
    color: "bg-sun/30",
  },
];

const FEATURES = [
  { icon: MessageCircleHeartIcon, title: "Corrige con cariño", text: "Te reformula la frase correcta sin cortarte. Al final recibes tus correcciones." },
  { icon: CameraIcon, title: "Aprende con lo que te rodea", text: "Muestra un objeto y pregunta “¿cómo se dice?”. Tu cuarto se vuelve tu salón." },
  { icon: BrainIcon, title: "Se adapta a ti", text: "Habla más lento en A1, te reta en B2 y recuerda de qué hablaron la última vez." },
  { icon: RepeatIcon, title: "Vocabulario que se queda", text: "Las palabras nuevas se guardan solas y las repasas con tarjetas inteligentes." },
];

const VARIANTS = [
  {
    flag: "US" as const,
    name: "Inglés americano",
    examples: ["Let's take the elevator.", "I need to check my cell phone.", "See you in the fall!"],
    accent: "from-sky/40",
  },
  {
    flag: "GB" as const,
    name: "Inglés británico",
    examples: ["Shall we take the lift?", "Fancy a cuppa?", "I'll ring you later, mate."],
    accent: "from-coral/30",
  },
  {
    flag: "DE" as const,
    name: "Alemán",
    examples: ["Wie geht's dir heute?", "Das ist meine Tasse.", "Ich hätte gern einen Kaffee."],
    accent: "from-sun/40",
  },
];

const MODULES = [
  { emoji: "☕", title: "Small talk", level: "A2" },
  { emoji: "🏠", title: "Describe tu casa", level: "A1 · con visión" },
  { emoji: "🍽️", title: "En el restaurante", level: "A1" },
  { emoji: "✈️", title: "Aeropuerto y viajes", level: "A2" },
  { emoji: "🛍️", title: "De compras", level: "A2 · con visión" },
  { emoji: "🩺", title: "En el médico", level: "B1" },
  { emoji: "💼", title: "Entrevista de trabajo", level: "B1" },
  { emoji: "📊", title: "Reuniones de trabajo", level: "B2" },
];

export default function LandingPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 md:grid-cols-[1.05fr_1fr] md:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm font-medium shadow-sm">
              <span className="size-2 rounded-full bg-mint" /> Tutor IA por video · <Flag code="US" /> <Flag code="GB" /> <Flag code="DE" />
            </span>
            <h1 className="mt-6 font-heading text-4xl font-extrabold leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Habla inglés y alemán con un tutor que{" "}
              <span className="text-gradient">te ve y te entiende</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground text-balance">
              Conversa por video con un tutor de inteligencia artificial que corrige con paciencia, se adapta a tu
              nivel y ve lo que le muestras: tu café, tu cuarto, tu libro.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/test-de-nivel" className={cn(buttonVariants(), "h-12 rounded-full px-6 text-base")}>
                Haz tu test de nivel gratis <ArrowRightIcon />
              </Link>
              <Link
                href="#como-funciona"
                className={cn(buttonVariants({ variant: "outline" }), "h-12 rounded-full px-6 text-base")}
              >
                Ver cómo funciona
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Sin tarjeta · 5 minutos gratis con tu tutor</p>
          </div>
          <HeroCallMock />
        </div>
      </section>

      {/* PARA QUE */}
      <section aria-label="Para qué practicar" className="border-y bg-muted/40 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 text-sm font-semibold text-muted-foreground">
          <span>Practica para:</span>
          <span>✈️ Viajar</span>
          <span>💼 Entrevistas</span>
          <span>🌍 Trabajo remoto</span>
          <span>🎓 Exámenes</span>
          <span><Flag code="DE" /> Mudarte a Alemania</span>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-semibold text-primary">Cómo funciona</p>
          <h2 className="mt-2 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
            De cero a conversar, en tres pasos
          </h2>
        </div>
        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-3xl border bg-card p-7 shadow-sm">
              <span className="absolute right-6 top-5 font-heading text-6xl font-extrabold text-muted/80">{i + 1}</span>
              <span className={cn("grid size-12 place-items-center rounded-2xl", s.color)}>
                <s.icon className="size-6" />
              </span>
              <h3 className="mt-5 font-heading text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* VISION */}
      <section id="vision" className="scroll-mt-20 bg-gradient-to-b from-secondary/60 to-background py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 md:grid-cols-2">
          <div>
            <p className="font-semibold text-primary">Visión por computador</p>
            <h2 className="mt-2 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
              Tu tutor ve tu mundo. Tu cuarto es tu salón.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Levanta un objeto y pregunta “What is this?”. Describe tu casa, lee una etiqueta o comparte tu pantalla:
              el tutor lo ve y lo convierte en vocabulario útil para ti.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-2xl border bg-card p-4">
                  <f.icon className="size-5 text-primary" />
                  <p className="mt-2 font-semibold">{f.title}</p>
                  <p className="text-sm text-muted-foreground">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
          <VisionShowcase />
        </div>
      </section>

      {/* VARIANTES */}
      <section className="mx-auto max-w-6xl px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-semibold text-primary">Tres tutores, tres acentos</p>
          <h2 className="mt-2 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
            Aprende el inglés que vas a usar
          </h2>
          <p className="mt-4 text-muted-foreground">
            Cada tutor habla con su acento, sus palabras y sus costumbres. Cambia cuando quieras.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {VARIANTS.map((v) => (
            <div key={v.name} className={cn("rounded-3xl border bg-gradient-to-b to-card p-7", v.accent)}>
              <Flag code={v.flag} className="h-10" />
              <h3 className="mt-3 font-heading text-xl font-bold">{v.name}</h3>
              <ul className="mt-4 space-y-2">
                {v.examples.map((e) => (
                  <li key={e} className="rounded-xl bg-card/80 px-3 py-2 text-sm font-medium shadow-sm">
                    “{e}”
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* MODULOS */}
      <section className="border-y bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="font-semibold text-primary">Módulos por nivel</p>
              <h2 className="mt-2 font-heading text-3xl font-extrabold tracking-tight">Conversaciones de la vida real</h2>
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Elige un tema o deja que el tutor te proponga uno según tu nivel y tus metas.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {MODULES.map((m) => (
              <div key={m.title} className="rounded-2xl border bg-card p-5 transition-transform hover:-translate-y-1">
                <span className="text-3xl" aria-hidden="true">{m.emoji}</span>
                <p className="mt-3 font-semibold leading-tight">{m.title}</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">{m.level}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRECIOS */}
      <section id="precios" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="font-semibold text-primary">Precios</p>
          <h2 className="mt-2 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
            Empieza gratis. Sigue a tu ritmo.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Test de nivel y 5 minutos con tu tutor sin costo. Después, elige el plan que te acomode.
          </p>
        </div>
        <PricingCards />
      </section>

      {/* FAQ */}
      <section id="preguntas" className="scroll-mt-20 bg-muted/30 py-24">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="mb-10 text-center font-heading text-3xl font-extrabold tracking-tight">Preguntas frecuentes</h2>
          <Faq />
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="px-4 py-24">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-primary via-[oklch(0.5_0.22_310)] to-coral px-8 py-16 text-center text-primary-foreground shadow-2xl">
          <div className="absolute -right-10 -top-10 size-48 rounded-full bg-sun/30 blur-2xl" />
          <h2 className="font-heading text-3xl font-extrabold tracking-tight sm:text-5xl">
            Tu primera conversación está a 5 minutos
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg opacity-90">
            Descubre tu nivel gratis y saluda a tu tutor hoy mismo.
          </p>
          <Link
            href="/test-de-nivel"
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "mt-8 h-12 rounded-full bg-white px-7 text-base text-primary hover:bg-white/90",
            )}
          >
            Empezar mi test gratis <ArrowRightIcon />
          </Link>
        </div>
      </section>
    </>
  );
}
