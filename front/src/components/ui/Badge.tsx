import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { Tone } from "../../domain/meta";
import { cn } from "../../lib/cn";

export const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-muted border-line",
  accent: "bg-accent-soft text-accent border-accent/25",
  good: "bg-good-soft text-good border-good/25",
  warn: "bg-warn-soft text-warn border-warn/30",
  serious: "bg-serious-soft text-serious border-serious/30",
  critical: "bg-critical-soft text-critical border-critical/30",
};

export const TONE_SOLID: Record<Tone, string> = {
  neutral: "bg-fg-subtle",
  accent: "bg-accent",
  good: "bg-good",
  warn: "bg-warn",
  serious: "bg-serious",
  critical: "bg-critical",
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-fg-muted",
  accent: "text-accent",
  good: "text-good",
  warn: "text-warn",
  serious: "text-serious",
  critical: "text-critical",
};

interface BadgeProps {
  tone?: Tone;
  icon?: LucideIcon;
  mono?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = "neutral", icon: Icon, mono, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap",
        mono && "font-mono",
        TONE_SOFT[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3" aria-hidden />}
      {children}
    </span>
  );
}
