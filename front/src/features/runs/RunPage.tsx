import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { useRoute } from "../../app/router";
import { stageMeta, PIPELINE_STAGES } from "../../domain/meta";
import { EmptyState } from "../../components/ui/misc";
import { useWorkflows } from "../workflows/useWorkflows";
import { DecisionPanel } from "./DecisionPanel";
import { EventLog } from "./EventLog";
import { RunForm } from "./RunForm";
import { isActive } from "./runReducer";
import { Timeline } from "./Timeline";
import { useRun } from "./useRun";

/** Playground: compositor a la izquierda, ejecución en vivo a la derecha. */
export function RunPage() {
  const { params } = useRoute();
  const { workflows, loading, error } = useWorkflows();
  const { state, start, reset } = useRun();

  const [workflowId, setWorkflowId] = useState(() => state.workflowId ?? params.get("wf") ?? "");
  const [text, setText] = useState(state.text);

  // Elige un workflow válido cuando llega la lista (o cuando ?wf= cambia).
  const requested = params.get("wf");
  useEffect(() => {
    if (workflows.length === 0) return;
    setWorkflowId((current) => {
      if (requested && workflows.some((w) => w.id === requested)) return requested;
      return workflows.some((w) => w.id === current) ? current : workflows[0].id;
    });
  }, [workflows, requested]);

  const workflow = workflows.find((w) => w.id === (state.workflowId ?? workflowId));
  const busy = isActive(state);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="xl:sticky xl:top-20 xl:self-start">
        <RunForm
          workflows={workflows}
          loadingWorkflows={loading}
          workflowsError={error}
          workflowId={workflowId}
          onWorkflowChange={setWorkflowId}
          text={text}
          onTextChange={setText}
          busy={busy}
          canReset={state.phase !== "idle" || text.length > 0}
          onSubmit={() => void start(workflowId, text)}
          onReset={() => {
            reset();
            setText("");
          }}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        {state.phase === "idle" ? (
          <IdleState />
        ) : (
          <>
            <Timeline state={state} />
            <DecisionPanel
              decision={state.decision}
              workflow={workflow}
              pending={busy}
              error={state.error}
              onRetry={state.workflowId ? () => void start(state.workflowId!, state.text) : undefined}
            />
            <EventLog entries={state.log} startedAt={state.startedAt} live={busy} />
          </>
        )}
      </div>
    </div>
  );
}

function IdleState() {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface/50 p-6">
      <ol className="mb-2 grid gap-3 opacity-70 sm:grid-cols-3" aria-label="Etapas del pipeline">
        {PIPELINE_STAGES.map((s, i) => {
          const Icon = stageMeta(s.id).icon;
          return (
            <li key={s.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
              <span className="font-mono text-[10px] text-fg-subtle">0{i + 1}</span>
              <Icon className="size-4 text-fg-subtle" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{s.label}</p>
                <p className="truncate text-[11px] text-fg-subtle">{s.service}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <EmptyState
        icon={Sparkles}
        title="Listo para ejecutar"
        description="Cada run cruza neo-vector (Rust) y neo-model (Python) y vuelve por SSE. Verás cada etapa, su latencia y la ruta de la cascada en tiempo real."
      />
    </div>
  );
}
