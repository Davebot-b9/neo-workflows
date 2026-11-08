import { Check, LoaderCircle, X } from "lucide-react";
import { Fragment } from "react";

import { CopyButton } from "../../components/ui/misc";
import { stageMeta } from "../../domain/meta";
import { useNow } from "../../hooks/useNow";
import { cn } from "../../lib/cn";
import { duration, shortId } from "../../lib/format";
import { isActive } from "./runReducer";
import type { RunState, StageState } from "./types";

/** Pipeline del run: cada etapa es un nodo con su servicio, estado y cronómetro en vivo. */
export function Timeline({ state }: { state: RunState }) {
  const active = isActive(state);
  const now = useNow(active);
  const elapsed = state.startedAt ? (state.finishedAt ?? now) - state.startedAt : 0;

  return (
    <section aria-label="Pipeline del run" className="rounded-2xl border border-line bg-surface p-5 shadow-panel">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-semibold">Pipeline</h2>
          {state.runId && (
            <span className="flex min-w-0 items-center gap-0.5 rounded-md border border-line bg-surface-2/60 pl-2 font-mono text-[11px] text-fg-muted">
              <span className="truncate" title={state.runId}>
                {shortId(state.runId)}
              </span>
              <CopyButton value={state.runId} label="Copiar run_id" className="size-6" />
            </span>
          )}
        </div>
        <p className="font-mono text-xs text-fg-muted tabular" aria-live="off">
          {state.startedAt ? duration(elapsed) : "—"}
        </p>
      </div>

      <ol className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-0">
        {state.stages.map((stage, i) => (
          <Fragment key={stage.name}>
            {i > 0 && <Connector from={state.stages[i - 1]} to={stage} />}
            <StageNode stage={stage} now={now} />
          </Fragment>
        ))}
      </ol>
    </section>
  );
}

function StageNode({ stage, now }: { stage: StageState; now: number }) {
  const meta = stageMeta(stage.name);
  const Icon = meta.icon;
  const ms = stage.status === "running" && stage.startedAt ? now - stage.startedAt : stage.ms;

  return (
    <li
      className={cn(
        "relative flex flex-1 items-start gap-3 rounded-xl border p-3 transition-[border-color,background-color,box-shadow] duration-300 md:min-w-0 md:flex-col",
        stage.status === "pending" && "border-dashed border-line bg-transparent",
        stage.status === "running" && "border-accent/50 bg-accent-soft/40 shadow-[0_0_0_4px_var(--glow)]",
        stage.status === "done" && "border-line bg-surface-2/40",
        stage.status === "error" && "border-critical/40 bg-critical-soft/50",
      )}
      aria-current={stage.status === "running" ? "step" : undefined}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span
          className={cn(
            "grid size-9 place-items-center rounded-lg border",
            stage.status === "pending" && "border-line text-fg-subtle",
            stage.status === "running" && "border-accent/40 bg-surface text-accent",
            stage.status === "done" && "border-good/30 bg-good-soft text-good",
            stage.status === "error" && "border-critical/30 bg-critical-soft text-critical",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <StatusLabel status={stage.status} />
      </div>
      <div className="min-w-0 max-md:flex-1">
        <p className="text-sm font-medium">{meta.label}</p>
        <p className="mt-0.5 truncate text-xs text-fg-subtle">
          {meta.service} · {meta.tech}
        </p>
        <p className={cn("mt-2 font-mono text-lg tabular", stage.status === "pending" ? "text-fg-subtle" : "text-fg")}>
          {ms === null ? "—" : duration(ms)}
        </p>
      </div>
    </li>
  );
}

function StatusLabel({ status }: { status: StageState["status"] }) {
  const common = "flex items-center gap-1 text-[11px] font-medium";
  switch (status) {
    case "pending":
      return <span className={cn(common, "text-fg-subtle")}>En espera</span>;
    case "running":
      return (
        <span className={cn(common, "text-accent")}>
          <LoaderCircle className="size-3 animate-spin" aria-hidden /> Corriendo
        </span>
      );
    case "done":
      return (
        <span className={cn(common, "text-good")}>
          <Check className="size-3" aria-hidden /> Listo
        </span>
      );
    case "error":
      return (
        <span className={cn(common, "text-critical")}>
          <X className="size-3" aria-hidden /> Falló
        </span>
      );
  }
}

function Connector({ from, to }: { from: StageState; to: StageState }) {
  const flowing = from.status === "done" && to.status === "running";
  const passed = from.status === "done" && (to.status === "done" || to.status === "error");
  return (
    <li aria-hidden className="flex items-center justify-center max-md:h-3 md:w-8">
      <span
        className={cn(
          "rounded-full max-md:h-full max-md:w-0.5 md:h-0.5 md:w-full",
          flowing ? "flow-line" : passed ? "bg-good/50" : "bg-line",
        )}
      />
    </li>
  );
}
