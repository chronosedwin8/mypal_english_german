import { cn } from "@/lib/utils";

export type FlagCode = "US" | "GB" | "DE";

/**
 * Banderas en SVG: Windows no dibuja los emojis de bandera (muestra "US", "GB"...),
 * y buena parte de los estudiantes usa Windows.
 */
export function Flag({ code, className, title }: { code: FlagCode; className?: string; title?: string }) {
  const common = {
    role: title ? "img" : undefined,
    "aria-hidden": title ? undefined : true,
    className: cn("inline-block h-[0.8em] w-auto shrink-0 rounded-[2px] align-[-0.08em] shadow-[0_0_0_1px_rgba(0,0,0,0.08)]", className),
  } as const;

  if (code === "DE") {
    return (
      <svg viewBox="0 0 5 3" {...common}>
        {title && <title>{title}</title>}
        <rect width="5" height="1" fill="#000" />
        <rect y="1" width="5" height="1" fill="#DD0000" />
        <rect y="2" width="5" height="1" fill="#FFCE00" />
      </svg>
    );
  }
  if (code === "GB") {
    return (
      <svg viewBox="0 0 60 30" {...common}>
        {title && <title>{title}</title>}
        <clipPath id="gb-t">
          <path d="M30 15h30v15zv15H0zH0V0zV0h30z" />
        </clipPath>
        <path d="M0 0v30h60V0z" fill="#012169" />
        <path d="M0 0l60 30m0-30L0 30" stroke="#fff" strokeWidth="6" />
        <path d="M0 0l60 30m0-30L0 30" clipPath="url(#gb-t)" stroke="#C8102E" strokeWidth="4" />
        <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
        <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
      </svg>
    );
  }
  // US (simplificada: franjas + canton con estrellas en patron)
  return (
    <svg viewBox="0 0 38 20" {...common}>
      {title && <title>{title}</title>}
      <rect width="38" height="20" fill="#B22234" />
      {[1, 3, 5, 7, 9, 11].map((i) => (
        <rect key={i} y={(i * 20) / 13} width="38" height={20 / 13} fill="#fff" />
      ))}
      <rect width="15.2" height={(20 * 7) / 13} fill="#3C3B6E" />
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3, 4].map((c) => (
          <circle key={`${r}-${c}`} cx={1.6 + c * 3 + (r % 2) * 1.5} cy={1.5 + r * 2.6} r="0.55" fill="#fff" />
        )),
      )}
    </svg>
  );
}

export const FLAG_BY_LANGUAGE = { EN_US: "US", EN_GB: "GB", DE: "DE" } as const satisfies Record<string, FlagCode>;
