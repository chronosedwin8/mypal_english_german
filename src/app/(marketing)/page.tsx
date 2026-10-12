import {
  ArrowRightIcon,
  BrainIcon,
  ClipboardCheckIcon,
  EarIcon,
  MessageCircleHeartIcon,
  RepeatIcon,
  SparklesIcon,
  VideoIcon,
} from "lucide-react";
import Link from "next/link";

import { AvatarLoop } from "@/components/avatar-loop";
import { AccentPlayer } from "@/components/marketing/accent-player";
import { ClassReplay } from "@/components/marketing/class-replay";
import { ExamsSection } from "@/components/marketing/exams-section";
import { Faq } from "@/components/marketing/faq";
import { HeroLive } from "@/components/marketing/hero-live";
import { KidsSection } from "@/components/marketing/kids-section";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ASK = [
  "¿Cómo se dice “taza” en inglés británico?",
  "Practiquemos una entrevista de trabajo",
  "¿Qué es esto? 📷",
  "Corrígeme sin cortarme",
  "Explícame el present perfect con ejemplos",
  "Wie sagt man „Kühlschrank“ richtig?",
  "Simulemos el check-in en el aeropuerto",
  "Hazme preguntas del IELTS Speaking Part 3",
  "Háblame más despacio, por favor",
  "Describe lo que ves en mi cuarto",
  "¿Cómo pido un café en Londres?",
];

const HUMAN = [
  { icon: EarIcon, title: "Te escucha de verdad", text: "Entiende tus pausas y espera a que termines de pensar antes de responder." },
  { icon: MessageCircleHeartIcon, title: "Corrige sin cortarte", text: "Reformula tu frase correcta y te deja seguir hablando. Al final, tus correcciones." },
  { icon: BrainIcon, title: "Te recuerda", text: "Sabe tu nivel y de qué hablaron la última vez. Cada clase continúa la anterior." },
  { icon: RepeatIcon, title: "Vocabulario que se queda", text: "Lo nuevo se guarda solo y lo repasas con tarjetas inteligentes." },
];

const STEPS = [
  { icon: ClipboardCheckIcon, title: "Test de nivel gratis", text: "Sin registro. Voces nativas y una parte oral corta. En minutos sabes tu nivel." },
  { icon: VideoIcon, title: "5 minutos con Poly", text: "Crea tu cuenta y vive una clase real por video. Muéstrale algo y pregúntale." },
  { icon: SparklesIcon, title: "Elige tu ritmo", text: "Planes desde $25 al mes. Practica cuando quieras, para ti o para tus hijos." },
];

export default function LandingPage() {
  return (
    <>
      <HeroLive />

      {/* Lo que puedes pedirle */}
      <section aria-label="Lo que puedes pedirle" className="overflow-hidden border-b bg-background py-6">
        <div className="flex w-max animate-[marquee_45s_linear_infinite] gap-3 motion-reduce:animate-none">
          {[...ASK, ...ASK].map((q, i) => (
            <span key={i} className="whitespace-nowrap rounded-full border bg-card px-4 py-2 text-sm font-medium shadow-sm">
              {q}
            </span>
          ))}
        </div>
      </section>

      {/* Como hablar con una persona */}
      <section className="mx-auto max-w-6xl px-4 py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="font-semibold text-primary">Como hablar con una persona</p>
            <h2 className="mt-2 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
              No es un chat. Es una conversación cara a cara.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Poly te mira, sonríe, te escucha y responde en tiempo real. Practicas como en la vida real, pero sin vergüenza
              a equivocarte y a cualquier hora.
            </p>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {HUMAN.map((f) => (
                <div key={f.title}>
                  <f.icon className="size-6 text-primary" />
                  <p className="mt-2 font-semibold">{f.title}</p>
                  <p className="text-sm text-muted-foreground">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
          <ClassReplay />
        </div>
      </section>

      {/* Acentos */}
      <section id="vision" className="scroll-mt-20 bg-muted/40 py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="font-semibold text-primary">Tres tutoras, tres acentos</p>
            <h2 className="mt-2 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">Escucha la diferencia</h2>
            <p className="mt-4 text-muted-foreground">
              Elige el inglés que vas a usar —americano o británico— o el alemán. Cada tutora habla con su acento, sus
              palabras y sus costumbres.
            </p>
          </div>
          <AccentPlayer />
        </div>
      </section>

      <KidsSection />

      <ExamsSection />

      {/* Instituciones */}
      <section className="px-4 pb-8">
        <div className="mx-auto grid max-w-6xl items-center gap-8 rounded-[2rem] border bg-card p-8 shadow-sm md:grid-cols-[1.4fr_1fr] md:p-12">
          <div>
            <p className="font-semibold text-primary">Para colegios, universidades y empresas</p>
            <h2 className="mt-2 font-heading text-3xl font-extrabold tracking-tight">Lleva MyPAL a tu institución</h2>
            <p className="mt-3 text-muted-foreground">
              Panel docente con semáforo por estudiante, simulacros institucionales, revisión de Writing y Speaking, estadísticas por grupo y tutor con avatar
              en el aula, también para estudiantes desde 15 años. Licencias desde $10 por estudiante al mes.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <Link href="/instituciones#demo" className={cn(buttonVariants(), "h-12 rounded-full px-7 text-base")}>
              Solicita una demo <ArrowRightIcon />
            </Link>
            <Link href="/instituciones" className="text-sm font-semibold text-primary hover:underline">
              Ver cómo funciona
            </Link>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-semibold text-primary">Cómo funciona</p>
          <h2 className="mt-2 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">Empieza hoy, gratis</h2>
        </div>
        <ol className="relative mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-3xl border bg-card p-7 shadow-sm">
              <span className="absolute right-6 top-5 font-heading text-6xl font-extrabold text-muted">{i + 1}</span>
              <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <s.icon className="size-6" />
              </span>
              <h3 className="mt-5 font-heading text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Precios */}
      <section id="precios" className="scroll-mt-20 bg-muted/40 py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <p className="font-semibold text-primary">Precios</p>
            <h2 className="mt-2 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">Empieza gratis. Sigue a tu ritmo.</h2>
            <p className="mt-4 text-muted-foreground">Test de nivel y 5 minutos con Poly sin costo. Después, elige tu plan.</p>
          </div>
          <PricingCards />
        </div>
      </section>

      {/* Preguntas */}
      <section id="preguntas" className="scroll-mt-20 py-24">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="mb-10 text-center font-heading text-3xl font-extrabold tracking-tight">Preguntas frecuentes</h2>
          <Faq />
        </div>
      </section>

      {/* Cierre */}
      <section className="px-4 pb-24">
        <div className="relative mx-auto grid max-w-6xl items-center overflow-hidden rounded-[2.5rem] bg-[#0c0918] text-white shadow-2xl md:grid-cols-2">
          <div className="absolute -left-20 -top-20 size-80 rounded-full bg-primary/40 blur-3xl" />
          <div className="relative p-10 sm:p-14">
            <h2 className="font-heading text-3xl font-extrabold tracking-tight sm:text-5xl">Poly te está esperando</h2>
            <p className="mt-4 max-w-md text-lg text-white/70">Descubre tu nivel gratis y saluda a tu tutora hoy mismo.</p>
            <Link
              href="/test-de-nivel"
              className={cn(buttonVariants(), "mt-8 h-12 rounded-full bg-white px-7 text-base text-[#1b1433] hover:bg-white/90")}
            >
              Empezar mi test gratis <ArrowRightIcon />
            </Link>
          </div>
          <div className="relative h-72 md:h-full md:min-h-96">
            <AvatarLoop who="poly" className="absolute inset-0" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0c0918] via-transparent to-transparent" />
          </div>
        </div>
      </section>
    </>
  );
}
