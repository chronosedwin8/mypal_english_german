"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const QUESTIONS = [
  {
    q: "¿Cómo se cuentan los minutos?",
    a: "Solo cuenta el tiempo de la videollamada con tu tutor. Si terminas antes, lo que no usaste vuelve a tu saldo. El test de nivel, el vocabulario y los repasos no gastan minutos.",
  },
  {
    q: "¿El tutor es una persona?",
    a: "No. Es un tutor de inteligencia artificial con apariencia humana, entrenado para enseñar con paciencia. Siempre te lo decimos con claridad.",
  },
  {
    q: "¿Qué ve el tutor con mi cámara?",
    a: "Durante la clase, el tutor puede ver lo que le muestras para conversar sobre ello (un objeto, tu cuarto, un texto). No grabamos tus clases y la cámara solo se usa mientras estás en la llamada.",
  },
  {
    q: "¿Mis hijos pueden usarlo?",
    a: "Sí, con Nuez, la ardilla tutora para niños de 5 a 12 años. Se usa desde tu cuenta, siempre con un adulto presente; no pide datos personales y no graba.",
  },
  {
    q: "¿Qué nivel necesito?",
    a: "Desde cero (A1) hasta avanzado (C1). El test de nivel gratis te ubica y el tutor adapta su forma de hablar a ti.",
  },
  {
    q: "¿Puedo cancelar cuando quiera?",
    a: "Sí. Cancelas en un clic y conservas tus minutos hasta el final del periodo que ya pagaste.",
  },
  {
    q: "¿Qué necesito para las clases?",
    a: "Un navegador moderno (Chrome, Edge o Safari), cámara y micrófono. Funciona en computador y en celular.",
  },
];

export function Faq() {
  return (
    <Accordion className="mx-auto w-full max-w-2xl">
      {QUESTIONS.map((item) => (
        <AccordionItem key={item.q} value={item.q}>
          <AccordionTrigger className="text-left text-base font-semibold">{item.q}</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
