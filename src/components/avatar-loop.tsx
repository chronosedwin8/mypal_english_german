import { cn } from "@/lib/utils";

/**
 * Video en bucle del avatar real (vista previa de Tavus, sin audio).
 * poly = cara "Ruby" del PAL base · nuez = la ardilla para niños.
 */
export const AVATAR_MEDIA = {
  poly: { video: "/media/poly-loop.mp4", poster: "/media/poly-poster.jpg", alt: "Poly, tu tutora de idiomas" },
  nuez: { video: "/media/nuez-loop.mp4", poster: "/media/nuez-poster.jpg", alt: "Nuez, la ardilla tutora para niños" },
} as const;

export function AvatarLoop({ who, className }: { who: keyof typeof AVATAR_MEDIA; className?: string }) {
  const m = AVATAR_MEDIA[who];
  return (
    <video
      src={m.video}
      poster={m.poster}
      autoPlay
      loop
      muted
      playsInline
      preload="metadata"
      aria-label={m.alt}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}
