import { Activity, CircleAlert, CircleCheck, FlaskConical, Gauge, Hourglass, Layers, Rocket, RotateCcw, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";

import type { FineTuneRequest } from "../../api/types";
import { useGateway } from "../../app/gateway/gatewayContext";
import { LineChart } from "../../components/charts/LineChart";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { Callout, CopyButton, EmptyState, StatTile } from "../../components/ui/misc";
import { Panel } from "../../components/ui/Panel";
import { useNow } from "../../hooks/useNow";
import { duration, relativeTime, shortId } from "../../lib/format";
import { useWorkflows } from "../workflows/useWorkflows";
import { HyperparamsEditor, type ParamRow } from "./HyperparamsEditor";
import { bestLoss, type JobState } from "./jobReducer";
import { useAdapters } from "./useAdapters";
import { useFineTune } from "./useFineTune";

// Las mismas llaves que lee neo-model (model/neo_model/jobs.py); cualquier
// otra se ignora allá. Valores = los defaults de neo-model.
const DEFAULT_PARAMS: ParamRow[] = [
  { id: 1, key: "epochs", value: "3" },
  { id: 2, key: "batch_size", value: "4" },
  { id: 3, key: "lr", value: "1e-4" },
  { id: 4, key: "lora_r", value: "8" },
];

function validate(baseModel: string, datasetUri: string): { baseModel?: string; datasetUri?: string } {
  const errors: { baseModel?: string; datasetUri?: string } = {};
  if (!baseModel.trim()) errors.baseModel = "Indica el modelo base.";
  else if (/(^|@|:)latest$/i.test(baseModel.trim())) errors.baseModel = "Usa una versión fija, nunca \"latest\" (regla 6).";
  if (!datasetUri.trim()) errors.datasetUri = "Indica dónde está el dataset.";
  return errors;
}

export function FineTunePage() {
  const { workflows } = useWorkflows();
  const { state, start, reset } = useFineTune();
  const [baseModel, setBaseModel] = useState(() => state.request?.base_model ?? "");
  const [datasetUri, setDatasetUri] = useState(() => state.request?.dataset_uri ?? "");
  const [params, setParams] = useState<ParamRow[]>(DEFAULT_PARAMS);
  const [touched, setTouched] = useState(false);

  const busy = state.phase === "starting" || state.phase === "running";
  const errors = validate(baseModel, datasetUri);
  const suggestedModel = workflows.find((w) => w.provider === "local")?.model;

  function submit() {
    setTouched(true);
    if (errors.baseModel || errors.datasetUri) return;
    const hyperparameters = Object.fromEntries(params.filter((p) => p.key.trim()).map((p) => [p.key.trim(), p.value.trim()]));
    const request: FineTuneRequest = { base_model: baseModel.trim(), dataset_uri: datasetUri.trim(), hyperparameters };
    void start(request);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <Panel title="Nuevo entrenamiento" description="LoRA sobre el modelo base, ejecutado por neo-model." className="xl:sticky xl:top-20 xl:self-start">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field
            label="Modelo base"
            hint={suggestedModel ? `Sugerido por tus workflows: ${suggestedModel}` : "Siempre con versión fija."}
            error={touched ? errors.baseModel : null}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                value={baseModel}
                onChange={(e) => setBaseModel(e.target.value)}
                placeholder={suggestedModel ?? "onejev-4b@fase0-sim"}
                className="font-mono text-xs"
                disabled={busy}
              />
            )}
          </Field>
          <Field
            label="Dataset"
            hint="Un .jsonl de data/generated/ (neo-model lo lee en /datasets; solo cuenta el nombre del archivo)."
            error={touched ? errors.datasetUri : null}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                value={datasetUri}
                onChange={(e) => setDatasetUri(e.target.value)}
                placeholder="documents_hard_train.jsonl"
                className="font-mono text-xs"
                disabled={busy}
              />
            )}
          </Field>
          <HyperparamsEditor rows={params} onChange={setParams} disabled={busy} />
          <div className="flex gap-2 border-t border-line pt-4">
            {state.phase !== "idle" && !busy && (
              <Button variant="ghost" onClick={reset} leading={<RotateCcw className="size-4" aria-hidden />}>
                Limpiar
              </Button>
            )}
            <Button type="submit" variant="primary" loading={busy} className="flex-1 justify-center" leading={<Rocket className="size-4" aria-hidden />}>
              {busy ? "Entrenando…" : "Iniciar fine-tuning"}
            </Button>
          </div>
        </form>
      </Panel>

      <div className="flex min-w-0 flex-col gap-6">
        <JobMonitor state={state} />
        <AdaptersPanel justFinished={state.phase === "done" ? state.jobId : null} />
      </div>
    </div>
  );
}

function AdaptersPanel({ justFinished }: { justFinished: string | null | undefined }) {
  const { adapters, loading, error, reload } = useAdapters();
  const { workflows } = useWorkflows();

  // neo-api registra el adaptador al recibir job.done: se recarga en ese momento.
  useEffect(() => {
    if (justFinished) reload();
  }, [justFinished, reload]);

  return (
    <Panel
      title="Adaptadores entrenados"
      description={
        <>
          Para usar uno, ponlo en <span className="font-mono">adapter:</span> de un workflow (workflows/*.yaml) y reinicia neo-api.
        </>
      }
    >
      {error ? (
        <Callout tone="critical" icon={CircleAlert} title="No se pudo leer el registro">
          <span className="font-mono text-xs">{error}</span>
        </Callout>
      ) : adapters.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={loading ? "Cargando…" : "Todavía no hay adaptadores"}
          description="Cada fine-tuning terminado deja uno aquí, con su modelo base, dataset e hiperparámetros."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {adapters.map((a) => {
            const usedBy = workflows.filter((w) => w.adapter === a.id);
            return (
              <li key={a.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center rounded-md border border-line bg-surface-2/60 pl-2 font-mono text-xs">
                    {shortId(a.id)}
                    <CopyButton value={`adapter: "${a.id}"`} label="Copiar línea para el workflow" className="size-6" />
                  </span>
                  <span className="text-xs text-fg-subtle">{relativeTime(Date.parse(a.created_at))}</span>
                  {usedBy.map((w) => (
                    <Badge key={w.id} tone="good" mono>
                      {w.id}
                    </Badge>
                  ))}
                </div>
                <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-fg-subtle">Modelo base · dataset</dt>
                    <dd className="truncate font-mono" title={`${a.base_model} · ${a.dataset_uri}`}>
                      {a.base_model} · {a.dataset_uri}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-fg-subtle">Hiperparámetros</dt>
                    <dd className="truncate font-mono">
                      {Object.entries(a.hyperparameters)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(" · ") || "por defecto"}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function JobMonitor({ state }: { state: JobState }) {
  const { mode } = useGateway();
  const running = state.phase === "running" || state.phase === "starting";
  const now = useNow(running, 500);

  if (state.phase === "idle") {
    return (
      <Panel>
        <EmptyState
          icon={FlaskConical}
          title="Sin entrenamientos en curso"
          description={
            mode === "demo"
              ? "En modo demo el entrenamiento se simula con una curva de pérdida realista, con los mismos eventos job.progress / job.done que emitirá neo-model."
              : "Al iniciar, neo-api relaya WatchJob de neo-model por SSE y aquí verás la curva de pérdida paso a paso."
          }
        />
      </Panel>
    );
  }

  const last = state.points[state.points.length - 1];
  const progress = state.maxSteps && last ? last.x / state.maxSteps : 0;
  const best = bestLoss(state.points);
  const elapsed = state.startedAt ? (state.finishedAt ?? now) - state.startedAt : 0;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Panel
        title={
          <span className="flex items-center gap-2">
            Job
            {state.jobId && (
              <span className="flex items-center rounded-md border border-line bg-surface-2/60 pl-2 font-mono text-[11px] font-normal text-fg-muted">
                {shortId(state.jobId)}
                <CopyButton value={state.jobId} label="Copiar job_id" className="size-6" />
              </span>
            )}
          </span>
        }
        description={state.request && <span className="font-mono">{state.request.base_model}</span>}
        actions={<PhaseBadge phase={state.phase} />}
      >
        <div className="mb-2 flex items-baseline justify-between text-xs">
          <span className="text-fg-muted">
            Paso <span className="font-mono text-fg tabular">{last?.x ?? 0}</span> de{" "}
            <span className="font-mono tabular">{state.maxSteps ?? "—"}</span>
          </span>
          <span className="font-mono text-fg tabular">{Math.round(progress * 100)}%</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-surface-3"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-label="Progreso del entrenamiento"
        >
          <div
            className={state.phase === "error" ? "h-full bg-critical" : state.phase === "done" ? "h-full bg-good" : "h-full bg-accent transition-[width] duration-300"}
            style={{ width: `${Math.max(2, progress * 100)}%` }}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Loss actual" value={last ? last.y.toFixed(4) : "—"} icon={Activity} />
          <StatTile label="Mejor loss" value={best !== null ? best.toFixed(4) : "—"} icon={TrendingDown} />
          <StatTile label="ETA" value={state.phase === "done" ? "0s" : (state.eta ?? "—")} icon={Hourglass} />
          <StatTile label="Transcurrido" value={duration(elapsed)} icon={Gauge} />
        </div>
      </Panel>

      {state.phase === "error" && (
        <Callout tone="critical" icon={CircleAlert} title="El entrenamiento falló">
          <span className="font-mono text-xs">{state.error}</span>
        </Callout>
      )}

      {state.phase === "done" && state.adapterUri && state.jobId && (
        <Callout tone="good" icon={CircleCheck} title="Adaptador listo y registrado">
          <span className="flex flex-col gap-1 text-xs">
            <span>Para usarlo, agrega esta línea a un workflow y reinicia neo-api:</span>
            <span className="flex items-center gap-1 font-mono break-all">
              adapter: &quot;{state.jobId}&quot;
              <CopyButton value={`adapter: "${state.jobId}"`} label="Copiar línea para el workflow" />
            </span>
            <span className="font-mono text-fg-subtle break-all">{state.adapterUri}</span>
          </span>
        </Callout>
      )}

      <Panel title="Curva de pérdida" description="Una serie: loss por paso. Pasa el cursor para ver cada punto.">
        {state.points.length === 0 ? (
          <div className="grid h-[240px] place-items-center text-sm text-fg-subtle">Esperando el primer paso…</div>
        ) : (
          <LineChart
            points={state.points}
            height={260}
            xLabel="Paso"
            yLabel="Loss"
            formatY={(y) => y.toFixed(3)}
            xDomain={[1, state.maxSteps ?? state.points[state.points.length - 1].x]}
            ariaLabel={`Curva de pérdida: ${state.points.length} pasos, loss actual ${last?.y.toFixed(3)}`}
          />
        )}
      </Panel>
    </div>
  );
}

function PhaseBadge({ phase }: { phase: JobState["phase"] }) {
  switch (phase) {
    case "starting":
      return <Badge tone="accent">Enviando…</Badge>;
    case "running":
      return <Badge tone="accent" icon={Activity}>Entrenando</Badge>;
    case "done":
      return <Badge tone="good" icon={CircleCheck}>Terminado</Badge>;
    case "error":
      return <Badge tone="critical" icon={CircleAlert}>Error</Badge>;
    default:
      return null;
  }
}
