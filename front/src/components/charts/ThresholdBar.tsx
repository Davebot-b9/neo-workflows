import type { Workflow } from "../../api/types";
import { routeFor } from "../../domain/cascade";
import { ROUTE_META } from "../../domain/meta";
import { cn } from "../../lib/cn";

interface ThresholdBarProps {
  cascade: Workflow["cascade"];
  /** Confianza a marcar (0–1). Sin valor, solo dibuja las zonas. */
  value?: number;
  className?: string;
}

/**
 * Bullet chart de la cascada: tres zonas (revisión · LLM · auto) separadas
 * por los umbrales del workflow, y un marcador con la confianza del run.
 */
export function ThresholdBar({ cascade, value, className }: ThresholdBarProps) {
  const zones = [
    { route: "review" as const, from: 0, to: cascade.llm, fill: "bg-serious/25", active: "bg-serious/60", dot: "bg-serious" },
    { route: "llm" as const, from: cascade.llm, to: cascade.auto, fill: "bg-warn/25", active: "bg-warn/60", dot: "bg-warn" },
    { route: "auto" as const, from: cascade.auto, to: 1, fill: "bg-good/25", active: "bg-good/60", dot: "bg-good" },
  ];
  const clamped = value === undefined ? undefined : Math.min(1, Math.max(0, value));
  const route = clamped === undefined ? null : routeFor(clamped, cascade);

  return (
    <div className={cn("w-full", className)}>
      <div
        className="relative h-9"
        role="img"
        aria-label={
          clamped === undefined
            ? `Umbrales: revisión debajo de ${cascade.llm}, LLM desde ${cascade.llm}, automático desde ${cascade.auto}`
            : `Confianza ${clamped.toFixed(2)}: ${ROUTE_META[route!].label}`
        }
      >
        {/* zonas, con 2px de separación */}
        <div className="absolute inset-x-0 top-3 flex h-3 gap-0.5">
          {zones.map((z) => (
            <div
              key={z.route}
              className={cn("h-full transition-colors duration-500 first:rounded-l-full last:rounded-r-full", route === z.route ? z.active : z.fill)}
              style={{ flex: `${z.to - z.from} 1 0%` }}
              title={`${ROUTE_META[z.route].label}: ${z.from.toFixed(2)}–${z.to.toFixed(2)}`}
            />
          ))}
        </div>

        {clamped !== undefined && (
          <div
            className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center transition-[left] duration-700 ease-out"
            style={{ left: `${clamped * 100}%` }}
          >
            <span className="h-full w-0.5 rounded-full bg-fg" />
            <span className="absolute top-2 size-5 rounded-full border-2 border-surface bg-fg shadow-panel" />
          </div>
        )}
      </div>

      <div className="relative mt-1 h-4 font-mono text-[10px] text-fg-subtle tabular">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${cascade.llm * 100}%` }}>
          {cascade.llm.toFixed(2)}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${cascade.auto * 100}%` }}>
          {cascade.auto.toFixed(2)}
        </span>
        <span className="absolute right-0">1</span>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-muted">
        {zones.map((z) => (
          <li key={z.route} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-sm", z.dot)} aria-hidden />
            {ROUTE_META[z.route].label}
          </li>
        ))}
      </ul>
    </div>
  );
}
