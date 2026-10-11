"use client";

import { Volume2Icon } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { reviewWord } from "./actions";

interface Item {
  id: string;
  term: string;
  translationEs: string | null;
  example: string | null;
  language: "EN_US" | "EN_GB" | "DE";
}

const LOCALE = { EN_US: "en-US", EN_GB: "en-GB", DE: "de-DE" } as const;

export function ReviewDeck({ items }: { items: Item[] }) {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const [pending, startTransition] = useTransition();
  const item = items[index];

  if (!items.length || !item) {
    return (
      <div className="rounded-3xl border bg-card p-8 text-center">
        <p className="text-4xl">🎉</p>
        <p className="mt-2 font-heading text-xl font-bold">{items.length ? "¡Repaso terminado!" : "Nada que repasar por ahora"}</p>
        <p className="text-sm text-muted-foreground">Vuelve mañana o practica con tu tutora para sumar palabras.</p>
      </div>
    );
  }

  function speak() {
    const u = new SpeechSynthesisUtterance(item.term);
    u.lang = LOCALE[item.language];
    window.speechSynthesis?.speak(u);
  }

  function grade(g: "again" | "hard" | "good" | "easy") {
    startTransition(async () => {
      await reviewWord(item.id, g);
      setShown(false);
      setIndex((i) => i + 1);
    });
  }

  return (
    <div className="mx-auto max-w-lg rounded-3xl border bg-card p-8 text-center shadow-sm">
      <p className="text-sm text-muted-foreground">
        Repaso · {index + 1} de {items.length}
      </p>
      <p className="mt-6 font-heading text-4xl font-extrabold" lang={LOCALE[item.language]}>
        {item.term}
      </p>
      <Button variant="ghost" size="sm" onClick={speak} className="mt-2">
        <Volume2Icon /> Escuchar
      </Button>
      {shown ? (
        <>
          <p className="mt-4 text-xl">{item.translationEs ?? "—"}</p>
          {item.example && <p className="mt-2 text-sm italic text-muted-foreground">“{item.example}”</p>}
          <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button variant="outline" disabled={pending} onClick={() => grade("again")}>Otra vez</Button>
            <Button variant="outline" disabled={pending} onClick={() => grade("hard")}>Difícil</Button>
            <Button variant="outline" disabled={pending} onClick={() => grade("good")}>Bien</Button>
            <Button disabled={pending} onClick={() => grade("easy")}>Fácil</Button>
          </div>
        </>
      ) : (
        <Button className="mt-8 h-11 rounded-full px-8" onClick={() => setShown(true)}>
          Ver significado
        </Button>
      )}
    </div>
  );
}
