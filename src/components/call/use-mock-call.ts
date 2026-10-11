"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CallControls, CallOptions, CallState, Caption } from "./types";

/**
 * Llamada SIMULADA (TAVUS_DRIVER=fake): permite probar toda la experiencia sin
 * gastar minutos de Tavus. Usa tu camara real y una tutora ilustrada.
 */
const SCRIPT: { role: Caption["role"]; text: string; tool?: { name: string; arguments: Record<string, unknown> } }[] = [
  { role: "tutor", text: "Hi! I'm Poly. Lovely to see you. (Modo simulado: Tavus no está conectado.)" },
  { role: "student", text: "Hi Poly! What is this?" },
  {
    role: "tutor",
    text: "That's a mug! Say it with me: mug.",
    tool: { name: "save_vocabulary", arguments: { term: "mug", translation_es: "taza", example: "I drink coffee from my mug." } },
  },
  { role: "student", text: "Mug. I drink coffee in my mug." },
  {
    role: "tutor",
    text: "Great! Just one thing: we say 'from my mug'. Lovely work!",
    tool: {
      name: "log_correction",
      arguments: { original: "I drink coffee in my mug", corrected: "I drink coffee from my mug", explanation_es: "Con 'drink' usamos 'from' para el recipiente." },
    },
  },
];

export function useMockCall(opts: CallOptions): CallState & CallControls {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const idRef = useRef(0);
  const [state, setState] = useState<CallState>({
    status: "idle",
    error: null,
    tutorVideo: null,
    tutorAudio: null,
    localVideo: null,
    tutorSpeaking: false,
    captions: [],
    micOn: true,
    camOn: true,
    sharing: false,
  });

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const join = useCallback(async () => {
    setState((s) => ({ ...s, status: "joining" }));
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      streamRef.current = null;
    }
    timers.current.push(
      setTimeout(() => {
        setState((s) => ({ ...s, status: "joined", localVideo: streamRef.current }));
        optsRef.current.onJoined();
      }, 1200),
    );
    SCRIPT.forEach((line, i) => {
      timers.current.push(
        setTimeout(() => {
          setState((s) => ({
            ...s,
            tutorSpeaking: line.role === "tutor",
            captions: [...s.captions, { id: ++idRef.current, role: line.role, text: line.text }].slice(-6),
          }));
          if (line.tool) optsRef.current.onToolCall(line.tool);
        }, 2500 + i * 4000),
      );
    });
    timers.current.push(setTimeout(() => setState((s) => ({ ...s, tutorSpeaking: false })), 2500 + SCRIPT.length * 4000));
  }, []);

  const leave = useCallback(async () => {
    clear();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setState((s) => (s.status === "left" ? s : { ...s, status: "left" }));
    optsRef.current.onLeft();
  }, []);

  useEffect(
    () => () => {
      clear();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return {
    ...state,
    join,
    leave,
    toggleMic: () => setState((s) => ({ ...s, micOn: !s.micOn })),
    toggleCam: () => {
      streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !state.camOn));
      setState((s) => ({ ...s, camOn: !s.camOn }));
    },
    toggleScreenShare: () => setState((s) => ({ ...s, sharing: !s.sharing })),
    say: (text: string) =>
      setState((s) => ({
        ...s,
        captions: [...s.captions, { id: ++idRef.current, role: "student" as const, text }, { id: ++idRef.current, role: "tutor" as const, text: "Of course! (respuesta simulada)" }].slice(-6),
      })),
  };
}
