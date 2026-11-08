import type { Tone } from "../../domain/meta";
import { cn } from "../../lib/cn";
import { TONE_SOLID } from "./Badge";

/** Punto de estado. Siempre acompañado de texto: nunca comunica solo con color. */
export function StatusDot({ tone, pulse, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)} aria-hidden>
      {pulse && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", TONE_SOLID[tone])} />}
      <span className={cn("relative inline-flex size-2 rounded-full", TONE_SOLID[tone])} />
    </span>
  );
}
