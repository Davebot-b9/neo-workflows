import { CircleAlert, RotateCcw } from "lucide-react";

import type { DecisionPayload, Workflow } from "../../api/types";
import { ThresholdBar } from "../../components/charts/ThresholdBar";
import { TONE_SOFT } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Callout, Skeleton } from "../../components/ui/misc";
import { effectiveConfidence } from "../../domain/cascade";
import { ROUTE_META } from "../../domain/meta";
import { cn } from "../../lib/cn";
import { AnswerCard } from "./AnswerCard";

interface DecisionPanelProps {
  decision: DecisionPayload | null;
  workflow: Workflow | undefined;
  pending: boolean;
  error: string | null;
  onRetry?: () => void;
}

const FALLBACK_CASCADE = { auto: 0.9, llm: 0.6 };

export function DecisionPanel({ decision, workflow, pending, error, onRetry }: DecisionPanelProps) {
  if (error) {
    return (
      <Callout
        tone="critical"
        icon={CircleAlert}
        title="El run falló"
        action={
          onRetry && (
            <Button size="sm" variant="secondary" onClick={onRetry} leading={<RotateCcw className="size-3.5" aria-hidden />}>
              Reintentar
            </Button>
          )
        }
      >
        <span className="font-mono text-xs">{error}</span>
      </Callout>
    );
  }

  if (!decision) {
    if (!pending) return null;
    return (
      <section aria-busy="true" aria-label="Esperando la decisión" className="rounded-2xl border border-line bg-surface p-5 shadow-panel">
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
        <Skeleton className="mt-6 h-3 w-full rounded-full" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </section>
    );
  }

  const meta = ROUTE_META[decision.route];
  const Icon = meta.icon;
  const cascade = workflow?.cascade ?? FALLBACK_CASCADE;

  return (
    <section aria-label="Decisión" className="animate-rise rounded-2xl border border-line bg-surface shadow-panel">
      <div className="flex flex-wrap items-center gap-4 border-b border-line p-5">
        <span className={cn("grid size-12 place-items-center rounded-xl border", TONE_SOFT[meta.tone])}>
          <Icon className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Ruta</p>
          <p className="text-lg font-semibold tracking-tight">{meta.label}</p>
          <p className="text-sm text-fg-muted">{meta.description}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Confianza</p>
          <p className="font-mono text-3xl font-semibold tracking-tight tabular">{decision.confidence.toFixed(2)}</p>
          <p className="text-[11px] text-fg-subtle">la menor de todas las preguntas</p>
        </div>
      </div>

      <div className="border-b border-line p-5">
        <ThresholdBar cascade={cascade} value={decision.confidence} />
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2">
        {Object.entries(decision.answers).map(([name, answer]) => (
          <AnswerCard
            key={name}
            name={name}
            answer={answer}
            question={workflow?.questions[name]}
            decidesRoute={Object.keys(decision.answers).length > 1 && Math.abs(effectiveConfidence(answer) - decision.confidence) < 1e-9}
          />
        ))}
      </div>
    </section>
  );
}
