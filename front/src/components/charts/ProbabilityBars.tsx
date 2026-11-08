import { answerLabel, pct } from "../../lib/format";
import { cn } from "../../lib/cn";

interface ProbabilityBarsProps {
  probabilities: Record<string, number>;
  /** Descripción de cada opción (criteria del workflow), para el tooltip. */
  descriptions?: Record<string, string>;
  /** Opción a resaltar (la elegida). Por defecto, la más probable. */
  highlight?: string;
  /** false conserva el orden de las llaves (niveles de un score). */
  sort?: boolean;
}

/** Una sola serie, etiquetada directamente: la opción resaltada en tono pleno, el resto atenuado. */
export function ProbabilityBars({ probabilities, descriptions, highlight, sort = true }: ProbabilityBarsProps) {
  const entries = Object.entries(probabilities);
  if (sort) entries.sort(([, a], [, b]) => b - a);
  const top = highlight ?? [...entries].sort(([, a], [, b]) => b - a)[0]?.[0];

  return (
    <ul className="flex flex-col gap-2">
      {entries.map(([key, p]) => {
        const isTop = key === top;
        return (
          <li key={key} className="group grid grid-cols-[minmax(4.5rem,8rem)_1fr_3rem] items-center gap-3" title={descriptions?.[key]}>
            <span className={cn("truncate text-xs", isTop ? "font-medium text-fg" : "text-fg-muted")}>{answerLabel(key)}</span>
            <span className="relative h-2 overflow-hidden rounded-full bg-surface-3">
              <span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full bg-series-1 transition-[width] duration-700 ease-out",
                  !isTop && "opacity-45 group-hover:opacity-70",
                )}
                style={{ width: `${Math.max(1.5, p * 100)}%` }}
              />
            </span>
            <span className={cn("text-right font-mono text-xs tabular", isTop ? "text-fg" : "text-fg-muted")}>{pct(p)}</span>
          </li>
        );
      })}
    </ul>
  );
}
