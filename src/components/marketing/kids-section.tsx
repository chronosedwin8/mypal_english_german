import { ArrowRightIcon, HeartHandshakeIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";

import { AvatarLoop } from "@/components/avatar-loop";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const POINTS = [
  { icon: SparklesIcon, title: "Aprender jugando", text: "Veo veo con la cámara, colores, animales, números y canciones." },
  { icon: HeartHandshakeIcon, title: "Paciencia infinita", text: "Nuez repite las veces que haga falta y celebra cada palabra." },
  { icon: ShieldCheckIcon, title: "Segura por diseño", text: "No pide datos personales, no graba y siempre con un adulto al lado." },
];

export function KidsSection() {
  return (
    <section className="relative overflow-hidden bg-[oklch(0.96_0.05_85)] py-24 dark:bg-[oklch(0.25_0.04_70)]">
      <div className="pointer-events-none absolute -left-20 top-10 size-72 rounded-full bg-coral/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 bottom-0 size-80 rounded-full bg-mint/30 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 lg:grid-cols-2">
        <div className="relative">
          <div className="relative aspect-[16/10] overflow-hidden rounded-[2.5rem] border-8 border-white shadow-2xl dark:border-white/10">
            <AvatarLoop who="nuez" />
            <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-[#3a2a00]">🐿️ Nuez · para niños</span>
          </div>
          <div className="absolute -bottom-5 left-6 rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 text-sm font-semibold text-[#22183d] shadow-xl">
            I spy something… <span className="text-coral">red!</span> 🔴
          </div>
          <div className="absolute -right-3 -top-4 rotate-6 rounded-2xl bg-sun px-3 py-2 text-sm font-bold text-[#3a2a00] shadow-lg">
            ¡Muéstrame tu juguete!
          </div>
        </div>
        <div>
          <p className="font-semibold text-coral">MyPAL para niños</p>
          <h2 className="mt-2 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
            Conoce a Nuez, la ardilla que enseña inglés y alemán
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Para niños de 5 a 12 años. Clases cortas por video con una tutora animada que ve sus juguetes y juega con ellos
            en el idioma que están aprendiendo. Se usa desde la cuenta de mamá, papá o un tutor.
          </p>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white shadow-sm dark:bg-white/10">
                  <p.icon className="size-5 text-coral" />
                </span>
                <span>
                  <span className="block font-semibold">{p.title}</span>
                  <span className="text-sm text-muted-foreground">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link href="/registro" className={cn(buttonVariants(), "mt-8 h-12 rounded-full bg-coral px-6 text-base text-white hover:bg-coral/90")}>
            Probar con mi hijo <ArrowRightIcon />
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">Las clases de niños usan los mismos minutos de tu plan.</p>
        </div>
      </div>
    </section>
  );
}
