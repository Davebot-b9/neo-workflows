import { Boxes, CornerDownLeft, Cpu, Layers, Lock, Play, RotateCcw } from "lucide-react";
import type { KeyboardEvent } from "react";

import type { Workflow } from "../../api/types";
import { useGateway } from "../../app/gateway/gatewayContext";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Field, Select, Textarea } from "../../components/ui/Field";
import { Kbd, Skeleton } from "../../components/ui/misc";
import { Panel } from "../../components/ui/Panel";
import { shortId } from "../../lib/format";
import { SAMPLES } from "./samples";

const MAX_CHARS = 8000;

interface RunFormProps {
  workflows: Workflow[];
  loadingWorkflows: boolean;
  workflowsError: string | null;
  workflowId: string;
  onWorkflowChange: (id: string) => void;
  text: string;
  onTextChange: (text: string) => void;
  busy: boolean;
  canReset: boolean;
  onSubmit: () => void;
  onReset: () => void;
}

/** Compositor del run: componente controlado, sin estado propio ni llamadas a la API. */
export function RunForm({
  workflows,
  loadingWorkflows,
  workflowsError,
  workflowId,
  onWorkflowChange,
  text,
  onTextChange,
  busy,
  canReset,
  onSubmit,
  onReset,
}: RunFormProps) {
  const { mode } = useGateway();
  const workflow = workflows.find((w) => w.id === workflowId);
  const tooLong = text.length > MAX_CHARS;
  const canSubmit = Boolean(workflow) && text.trim().length > 0 && !tooLong && !busy;
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (canSubmit) onSubmit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
  }

  return (
    <Panel title="Nuevo run" description="Elige un workflow, pega un documento y ejecútalo.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field label="Workflow" error={workflowsError}>
          {({ id, describedBy, invalid }) =>
            loadingWorkflows && workflows.length === 0 ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                value={workflowId}
                onChange={(e) => onWorkflowChange(e.target.value)}
                disabled={busy || workflows.length === 0}
              >
                {workflows.map((wf) => (
                  <option key={wf.id} value={wf.id}>
                    {wf.id} · v{wf.version}
                  </option>
                ))}
              </Select>
            )
          }
        </Field>

        {workflow && (
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-2.5 py-2">
              <Lock className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
              <dt className="sr-only">Modelo</dt>
              <dd className="truncate font-mono" title={`Modelo con versión fija: ${workflow.model}`}>
                {workflow.model}
              </dd>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-2.5 py-2">
              <Cpu className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
              <dt className="sr-only">Proveedor</dt>
              <dd className="truncate" title={workflow.adapter ? `Adaptador LoRA ${workflow.adapter}` : undefined}>
                {workflow.provider === "jev" ? "Jev (System One)" : workflow.adapter ? (
                  <>
                    Local + LoRA <span className="font-mono">{shortId(workflow.adapter)}</span>
                  </>
                ) : (
                  "Modelo local"
                )}
              </dd>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-2.5 py-2">
              <Layers className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
              <dt className="sr-only">Precedentes</dt>
              <dd>
                top-<span className="font-mono">{workflow.search.top_k}</span> precedentes
              </dd>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-2.5 py-2">
              <Boxes className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
              <dt className="sr-only">Preguntas</dt>
              <dd>
                <span className="font-mono">{Object.keys(workflow.questions).length}</span> preguntas
              </dd>
            </div>
          </dl>
        )}

        <Field
          label="Documento"
          error={tooLong ? `Máximo ${MAX_CHARS.toLocaleString("es-MX")} caracteres.` : null}
          aside={
            <span className={tooLong ? "font-mono text-[11px] text-critical" : "font-mono text-[11px] text-fg-subtle"}>
              {text.length.toLocaleString("es-MX")}/{MAX_CHARS.toLocaleString("es-MX")}
            </span>
          }
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={8}
              placeholder="Pega aquí el texto que quieres clasificar…"
              disabled={busy}
            />
          )}
        </Field>

        <div>
          <p className="mb-2 text-xs font-medium text-fg-muted">Ejemplos sintéticos</p>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLES.filter((s) => mode === "demo" || !s.text.startsWith("[falla]")).map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => onTextChange(sample.text)}
                disabled={busy}
                className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent disabled:opacity-50"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="hidden items-center gap-1 text-xs text-fg-subtle sm:flex">
            <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>
              <CornerDownLeft className="size-3" aria-hidden />
            </Kbd>
            <span className="ml-1">para ejecutar</span>
          </p>
          <div className="flex gap-2 max-sm:w-full">
            {canReset && (
              <Button variant="ghost" onClick={onReset} disabled={busy} leading={<RotateCcw className="size-4" aria-hidden />}>
                Limpiar
              </Button>
            )}
            <Button type="submit" variant="primary" loading={busy} disabled={!canSubmit} leading={<Play className="size-4" aria-hidden />} className="max-sm:flex-1 max-sm:justify-center">
              {busy ? "Ejecutando…" : "Ejecutar run"}
            </Button>
          </div>
        </div>
        {mode === "demo" && (
          <Badge tone="accent" className="self-start">
            Simulado en el navegador
          </Badge>
        )}
      </form>
    </Panel>
  );
}
