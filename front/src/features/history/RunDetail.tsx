import { RotateCcw } from "lucide-react";

import { navigate } from "../../app/router";
import { Button } from "../../components/ui/Button";
import { stageMeta } from "../../domain/meta";
import { cn } from "../../lib/cn";
import { clockTime, duration } from "../../lib/format";
import { DecisionPanel } from "../runs/DecisionPanel";
import { useWorkflows } from "../workflows/useWorkflows";
import type { RunRecord } from "./historyStore";

export function RunDetail({ record }: { record: RunRecord }) {
  const { workflows } = useWorkflows();
  const workflow = workflows.find((w) => w.id === record.workflowId);
  const stageTotal = record.stages.reduce((sum, s) => sum + s.ms, 0) || 1;

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl border border-line bg-surface p-3">
          <dt className="text-xs text-fg-subtle">Inicio</dt>
          <dd className="mt-1 font-mono">{clockTime(record.startedAt)}</dd>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <dt className="text-xs text-fg-subtle">{record.source === "ledger" ? "Decidir" : "Total"}</dt>
          <dd className="mt-1 font-mono">{duration(record.totalMs)}</dd>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <dt className="text-xs text-fg-subtle">Modo</dt>
          <dd className="mt-1">{record.mode === "live" ? "En vivo" : "Demo"}</dd>
        </div>
      </dl>

      {record.stages.length > 0 && (
      <section className="rounded-xl border border-line bg-surface p-4">
        <h3 className="mb-3 text-xs font-medium text-fg-muted">Tiempo por etapa</h3>
        {/* barra apilada por etapa: dónde se fue el tiempo del run */}
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-3">
          {record.stages.map((s, i) => (
            <div
              key={s.name}
              className={cn("h-full", s.status === "error" ? "bg-critical" : "bg-series-1")}
              style={{ flex: `${Math.max(s.ms, 1)} 1 0%`, opacity: 1 - i * 0.25 }}
              title={`${stageMeta(s.name).label}: ${duration(s.ms)}`}
            />
          ))}
        </div>
        <ul className="mt-3 grid gap-1.5">
          {record.stages.map((s) => (
            <li key={s.name} className="flex items-center justify-between text-xs">
              <span className={s.status === "error" ? "text-critical" : "text-fg-muted"}>
                {stageMeta(s.name).label} <span className="text-fg-subtle">· {stageMeta(s.name).service}</span>
              </span>
              <span className="font-mono tabular">
                {duration(s.ms)} <span className="text-fg-subtle">({Math.round((s.ms / stageTotal) * 100)}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      )}

      <DecisionPanel decision={record.decision} workflow={workflow} pending={false} error={record.error} />

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium text-fg-muted">Documento</h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate("/runs", { wf: record.workflowId })}
            leading={<RotateCcw className="size-3.5" aria-hidden />}
          >
            Abrir en Playground
          </Button>
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg-muted">{record.text}</p>
      </section>
    </div>
  );
}
