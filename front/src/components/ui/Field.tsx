import { ChevronDown } from "lucide-react";
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "../../lib/cn";

const CONTROL =
  "w-full rounded-lg border border-line bg-surface-2/60 px-3 text-sm text-fg placeholder:text-fg-subtle " +
  "transition-[border-color,box-shadow,background-color] duration-150 hover:border-line-strong " +
  "focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/15 focus:outline-none " +
  "aria-invalid:border-critical aria-invalid:focus:ring-critical/15 disabled:opacity-60";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  aside?: ReactNode;
  className?: string;
  /** Recibe el id del control y el id de la descripción para conectarlos por ARIA. */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Etiqueta + control + ayuda/error, con los atributos ARIA ya conectados. */
export function Field({ label, hint, error, aside, className, children }: FieldProps) {
  const id = useId();
  const descId = `${id}-desc`;
  const hasDesc = Boolean(error || hint);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-fg-muted">
          {label}
        </label>
        {aside}
      </div>
      {children({ id, describedBy: hasDesc ? descId : undefined, invalid: Boolean(error) })}
      {hasDesc && (
        <p id={descId} className={cn("text-xs", error ? "text-critical" : "text-fg-subtle")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, "h-10", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "min-h-32 resize-y py-2.5 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(CONTROL, "h-10 appearance-none pr-9", className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
    </div>
  );
}
