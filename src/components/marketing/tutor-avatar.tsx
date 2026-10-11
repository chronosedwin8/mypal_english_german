"use client";

import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Ilustracion del tutor (SVG animado): parpadea, respira y mueve la boca
 * cuando "habla". Es una ilustracion de marketing, no el avatar real de Tavus.
 */
export function TutorAvatar({ speaking = false, className }: { speaking?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.svg
      viewBox="0 0 220 240"
      role="img"
      aria-label="Ilustración de tu tutora de idiomas"
      className={cn("h-full w-full", className)}
      animate={reduce ? undefined : { y: [0, -3, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Hombros / sueter */}
      <path d="M22 240c4-42 38-66 88-66s84 24 88 66Z" fill="var(--primary)" />
      <path d="M86 178c8 14 40 14 48 0l-6 28H92Z" fill="color-mix(in oklch, var(--primary) 70%, black)" />
      {/* Cuello */}
      <path d="M94 150h32v34c0 8-32 8-32 0Z" fill="#e9b48f" />
      {/* Cabello atras */}
      <path d="M48 104c0-46 28-74 62-74s62 28 62 74c0 34-6 58-14 74H62c-8-16-14-40-14-74Z" fill="#33223f" />
      {/* Cara */}
      <ellipse cx="110" cy="104" rx="46" ry="54" fill="#f2c4a1" />
      {/* Orejas y aretes */}
      <ellipse cx="64" cy="108" rx="7" ry="11" fill="#eab792" />
      <ellipse cx="156" cy="108" rx="7" ry="11" fill="#eab792" />
      <circle cx="64" cy="124" r="4" fill="var(--coral)" />
      <circle cx="156" cy="124" r="4" fill="var(--coral)" />
      {/* Flequillo */}
      <path d="M62 92c6-38 30-56 54-56 26 0 44 18 48 44-18-2-40-12-52-28-8 18-28 34-50 40Z" fill="#3d2a4b" />
      {/* Cejas */}
      <path d="M84 88q10-6 20 0" stroke="#3d2a4b" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M116 88q10-6 20 0" stroke="#3d2a4b" strokeWidth="4" strokeLinecap="round" fill="none" />
      {/* Ojos (parpadeo) */}
      <motion.g
        style={{ originY: "104px" }}
        animate={reduce ? undefined : { scaleY: [1, 1, 0.1, 1, 1] }}
        transition={{ duration: 4.2, repeat: Infinity, times: [0, 0.9, 0.93, 0.96, 1] }}
      >
        <ellipse cx="94" cy="104" rx="6" ry="7" fill="#2a1d33" />
        <ellipse cx="126" cy="104" rx="6" ry="7" fill="#2a1d33" />
        <circle cx="96" cy="101" r="2" fill="white" />
        <circle cx="128" cy="101" r="2" fill="white" />
      </motion.g>
      {/* Mejillas */}
      <ellipse cx="82" cy="124" rx="9" ry="5" fill="var(--coral)" opacity="0.25" />
      <ellipse cx="138" cy="124" rx="9" ry="5" fill="var(--coral)" opacity="0.25" />
      {/* Nariz */}
      <path d="M110 108q-4 10 0 14" stroke="#d99d79" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* Boca */}
      {speaking && !reduce ? (
        <motion.ellipse
          cx="110"
          cy="136"
          rx="11"
          fill="#a33a4a"
          animate={{ ry: [2, 7, 3, 8, 2] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        />
      ) : (
        <path d="M96 132q14 12 28 0" stroke="#a33a4a" strokeWidth="4" strokeLinecap="round" fill="none" />
      )}
    </motion.svg>
  );
}
