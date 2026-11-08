import type { DecisionRoute } from "../../api/types";
import { ROUTE_META, ROUTE_ORDER } from "../../domain/meta";
import { cn } from "../../lib/cn";
import { pct } from "../../lib/format";
import { TONE_SOLID, TONE_TEXT } from "../ui/Badge";

/** Barra 100% apilada de rutas + leyenda con ícono, conteo y porcentaje (identidad nunca solo por color). */
export function RouteDistribution({ counts }: { counts: Record<DecisionRoute, number> }) {
  const total = ROUTE_ORDER.reduce((sum, r) => sum + counts[r], 0);

  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={ROUTE_ORDER.map((r) => `${ROUTE_META[r].label} ${counts[r]}`).join(", ")}>
        {total > 0 &&
          ROUTE_ORDER.filter((r) => counts[r] > 0).map((r) => (
            <div
              key={r}
              className={cn("h-full transition-[width] duration-700 first:rounded-l-full last:rounded-r-full", TONE_SOLID[ROUTE_META[r].tone])}
              style={{ flex: `${counts[r]} 1 0%` }}
              title={`${ROUTE_META[r].label}: ${counts[r]} (${pct(counts[r] / total)})`}
            />
          ))}
      </div>
      <ul className="mt-4 grid gap-2">
        {ROUTE_ORDER.map((r) => {
          const meta = ROUTE_META[r];
          const Icon = meta.icon;
          return (
            <li key={r} className="flex items-center gap-2 text-sm">
              <Icon className={cn("size-4", TONE_TEXT[meta.tone])} aria-hidden />
              <span className="flex-1 text-fg-muted">{meta.label}</span>
              <span className="font-mono text-xs tabular">{counts[r]}</span>
              <span className="w-10 text-right font-mono text-xs text-fg-subtle tabular">{total ? pct(counts[r] / total) : "—"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
