import { useId, useMemo, useState, type PointerEvent } from "react";

import { useElementWidth } from "../../hooks/useElementWidth";

export interface Point {
  x: number;
  y: number;
}

interface LineChartProps {
  points: Point[];
  height?: number;
  xLabel: string;
  yLabel: string;
  formatY?: (y: number) => string;
  /** Dominio fijo de x (p. ej. 0..max_steps) para que la curva crezca en su lugar. */
  xDomain?: [number, number];
  ariaLabel: string;
}

const PAD = { top: 12, right: 12, bottom: 24, left: 44 };

function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

/** Línea de una serie: 2px, área tenue, grilla recesiva y crosshair con tooltip. */
export function LineChart({ points, height = 220, xLabel, yLabel, formatY = (y) => y.toFixed(3), xDomain, ariaLabel }: LineChartProps) {
  const gradientId = useId();
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length === 0 || width === 0) return null;
    const [x0, x1] = xDomain ?? [points[0].x, points[points.length - 1].x || 1];
    const ys = points.map((p) => p.y);
    const yMin = Math.max(0, Math.min(...ys) * 0.9);
    const yMax = Math.max(...ys) * 1.05 || 1;
    const innerW = width - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    const sx = (x: number) => PAD.left + ((x - x0) / (x1 - x0 || 1)) * innerW;
    const sy = (y: number) => PAD.top + innerH - ((y - yMin) / (yMax - yMin || 1)) * innerH;
    const line = points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
    const area = `${line}L${sx(points[points.length - 1].x).toFixed(1)},${PAD.top + innerH}L${sx(points[0].x).toFixed(1)},${PAD.top + innerH}Z`;
    return { sx, sy, line, area, innerH, yTicks: niceTicks(yMin, yMax, 4), xTicks: niceTicks(x0, x1, 5) };
  }, [points, width, height, xDomain]);

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (!geometry) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(geometry.sx(p.x) - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHover(best);
  }

  const hovered = hover !== null ? points[hover] : null;

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      {geometry && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
          className="touch-none select-none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--series-1)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--series-1)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {geometry.yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={geometry.sy(t)} y2={geometry.sy(t)} stroke="var(--line)" strokeDasharray="2 4" />
              <text x={PAD.left - 8} y={geometry.sy(t)} dy="0.32em" textAnchor="end" className="fill-fg-subtle font-mono text-[10px]">
                {formatY(t)}
              </text>
            </g>
          ))}
          {geometry.xTicks.map((t) => (
            <text key={t} x={geometry.sx(t)} y={height - 6} textAnchor="middle" className="fill-fg-subtle font-mono text-[10px]">
              {Math.round(t)}
            </text>
          ))}

          <path d={geometry.area} fill={`url(#${gradientId})`} />
          <path d={geometry.line} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {/* punta de la serie: dónde va el entrenamiento ahora */}
          {points.length > 0 && !hovered && (
            <circle
              cx={geometry.sx(points[points.length - 1].x)}
              cy={geometry.sy(points[points.length - 1].y)}
              r="4"
              fill="var(--series-1)"
              stroke="var(--surface)"
              strokeWidth="2"
            />
          )}

          {hovered && (
            <g pointerEvents="none">
              <line x1={geometry.sx(hovered.x)} x2={geometry.sx(hovered.x)} y1={PAD.top} y2={PAD.top + geometry.innerH} stroke="var(--line-strong)" />
              <circle cx={geometry.sx(hovered.x)} cy={geometry.sy(hovered.y)} r="4.5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}

      {geometry && hovered && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop"
          style={{ left: Math.min(Math.max(geometry.sx(hovered.x), 70), width - 70) }}
        >
          <p className="text-fg-subtle">
            {xLabel} <span className="font-mono text-fg tabular">{hovered.x}</span>
          </p>
          <p className="text-fg-subtle">
            {yLabel} <span className="font-mono font-medium text-fg tabular">{formatY(hovered.y)}</span>
          </p>
        </div>
      )}
    </div>
  );
}
