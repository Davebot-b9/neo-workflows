import { useState } from "react";

import { duration } from "../../lib/format";

export interface LatencySample {
  id: string;
  ms: number;
  label: string;
}

/** Barras de latencia por run (una serie). Tooltip por barra, objetivo de hover más grande que la barra. */
export function LatencyBars({ samples, height = 96 }: { samples: LatencySample[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...samples.map((s) => s.ms), 1);
  const hovered = hover !== null ? samples[hover] : null;

  return (
    <div className="relative">
      <div className="flex items-end gap-0.5" style={{ height }} role="img" aria-label={`Latencia de los últimos ${samples.length} runs`}>
        {samples.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className="group flex h-full max-w-7 flex-1 items-end focus-visible:outline-none"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`${s.label}: ${duration(s.ms)}`}
          >
            <span
              className="w-full rounded-t-[4px] bg-series-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              style={{ height: `${Math.max(4, (s.ms / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-fg-subtle">
        <span>más antiguo</span>
        <span>máx {duration(max)}</span>
        <span>reciente</span>
      </div>
      {hovered && (
        <div className="pointer-events-none absolute -top-2 right-0 -translate-y-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop">
          <span className="text-fg-muted">{hovered.label}</span> · <span className="font-mono font-medium tabular">{duration(hovered.ms)}</span>
        </div>
      )}
    </div>
  );
}
