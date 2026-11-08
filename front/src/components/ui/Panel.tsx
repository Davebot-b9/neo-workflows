import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/cn";

interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Quita el padding del cuerpo (tablas, listas a todo lo ancho). */
  flush?: boolean;
}

/** Superficie base de la app: borde fino, sombra suave, encabezado opcional. */
export function Panel({ title, description, actions, flush, className, children, ...rest }: PanelProps) {
  return (
    <section
      className={cn("min-w-0 rounded-2xl border border-line bg-surface shadow-panel", className)}
      {...rest}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(!flush && "p-5")}>{children}</div>
    </section>
  );
}
