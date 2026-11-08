import { Check, Copy, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import type { Tone } from "../../domain/meta";
import { cn } from "../../lib/cn";
import { TONE_SOFT } from "./Badge";

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[10px] text-fg-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-3", className)} aria-hidden />;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      <div className="grid size-11 place-items-center rounded-xl border border-line bg-surface-2 text-fg-muted">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

interface CalloutProps {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function Callout({ tone, icon: Icon, title, children, action }: CalloutProps) {
  return (
    <div role={tone === "critical" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-4", TONE_SOFT[tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {children && <div className="mt-1 text-sm break-words text-fg-muted">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function CopyButton({ value, label = "Copiar", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setCopied(true));
      }}
      className={cn(
        "inline-grid size-7 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg",
        className,
      )}
      aria-label={copied ? "Copiado" : label}
      title={copied ? "Copiado" : label}
    >
      {copied ? <Check className="size-3.5 text-good" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  );
}

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}

export function StatTile({ label, value, hint, icon: Icon, className }: StatTileProps) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-panel", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg-muted">{label}</p>
        {Icon && <Icon className="size-4 text-fg-subtle" aria-hidden />}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular">{value}</p>
      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}
