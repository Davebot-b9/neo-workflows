import { CircleAlert, Cpu, Layers, Lock, Play, RefreshCw, Workflow as WorkflowIcon } from "lucide-react";

import type { Workflow } from "../../api/types";
import { navigate } from "../../app/router";
import { ThresholdBar } from "../../components/charts/ThresholdBar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Callout, EmptyState, Skeleton } from "../../components/ui/misc";
import { useWorkflows } from "./useWorkflows";

export function WorkflowsPage() {
  const { workflows, loading, error, reload } = useWorkflows();

  if (error && workflows.length === 0) {
    return (
      <Callout
        tone="critical"
        icon={CircleAlert}
        title="No se pudieron cargar los workflows"
        action={
          <Button size="sm" onClick={reload} leading={<RefreshCw className="size-3.5" aria-hidden />}>
            Reintentar
          </Button>
        }
      >
        {error}
      </Callout>
    );
  }

  if (loading && workflows.length === 0) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (workflows.length === 0) {
    return <EmptyState icon={WorkflowIcon} title="Sin workflows" description="neo-api no cargó ningún archivo de workflows/*.yaml." />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {workflows.map((wf, i) => (
        <WorkflowCard key={wf.id} workflow={wf} index={i} />
      ))}
    </div>
  );
}

function WorkflowCard({ workflow, index }: { workflow: Workflow; index: number }) {
  const questions = Object.entries(workflow.questions);

  return (
    <article
      className="flex animate-rise flex-col rounded-2xl border border-line bg-surface shadow-panel transition-[border-color,box-shadow] duration-200 hover:border-line-strong"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <header className="flex items-start justify-between gap-3 border-b border-line p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-base font-semibold">{workflow.id}</h2>
            <Badge mono>v{workflow.version}</Badge>
          </div>
          <p className="mt-1 text-xs text-fg-muted">workflows/{workflow.id}.yaml</p>
        </div>
        <Button size="sm" variant="primary" onClick={() => navigate("/runs", { wf: workflow.id })} leading={<Play className="size-3.5" aria-hidden />}>
          Probar
        </Button>
      </header>

      <dl className="grid grid-cols-3 divide-x divide-line border-b border-line text-xs">
        <div className="p-4">
          <dt className="flex items-center gap-1.5 text-fg-subtle">
            <Cpu className="size-3.5" aria-hidden /> Proveedor
          </dt>
          <dd className="mt-1 font-medium">{workflow.provider === "jev" ? "Jev" : "Local"}</dd>
        </div>
        <div className="min-w-0 p-4">
          <dt className="flex items-center gap-1.5 text-fg-subtle">
            <Lock className="size-3.5" aria-hidden /> Modelo fijo
          </dt>
          <dd className="mt-1 truncate font-mono font-medium" title={workflow.model}>
            {workflow.model}
          </dd>
        </div>
        <div className="p-4">
          <dt className="flex items-center gap-1.5 text-fg-subtle">
            <Layers className="size-3.5" aria-hidden /> Precedentes
          </dt>
          <dd className="mt-1 font-medium">top-{workflow.search.top_k}</dd>
        </div>
      </dl>

      <section className="flex-1 border-b border-line p-5">
        <h3 className="mb-3 text-xs font-medium text-fg-muted">Preguntas ({questions.length})</h3>
        <ul className="flex flex-col gap-3">
          {questions.map(([name, q]) => (
            <li key={name} className="rounded-xl border border-line bg-surface-2/40 p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{name}</span>
                <Badge mono>{q.type}</Badge>
              </div>
              <p className="mt-1 text-xs text-fg-muted">{q.instructions}</p>
              {q.criteria && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(q.criteria).map(([option, desc]) => (
                    <li key={option} className="rounded-md border border-line bg-surface px-2 py-1 text-[11px]">
                      <span className="font-mono font-medium">{option}</span>
                      <span className="text-fg-subtle"> · {desc}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="p-5">
        <h3 className="mb-2 text-xs font-medium text-fg-muted">Cascada</h3>
        <ThresholdBar cascade={workflow.cascade} />
      </section>
    </article>
  );
}
