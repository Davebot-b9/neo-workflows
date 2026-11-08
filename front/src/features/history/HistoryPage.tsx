import { CircleAlert, Database, Download, History, Play, RefreshCw, Search, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { navigate } from "../../app/router";
import { RouteBadge } from "../../components/domain/RouteBadge";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { Input } from "../../components/ui/Field";
import { EmptyState } from "../../components/ui/misc";
import { Panel } from "../../components/ui/Panel";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { clockTime, duration, relativeTime } from "../../lib/format";
import { useGateway } from "../../app/gateway/gatewayContext";
import { clearHistory, outcomeOf, type RecordOutcome, type RunRecord } from "./historyStore";
import { useMergedHistory } from "./useMergedHistory";
import { RunDetail } from "./RunDetail";

type Filter = "all" | RecordOutcome;

const FILTERS = [
  { value: "all", label: "Todas" },
  { value: "auto", label: "Auto" },
  { value: "llm", label: "LLM" },
  { value: "review", label: "Revisión" },
  { value: "error", label: "Error" },
] as const;

function exportJSON(records: RunRecord[]) {
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `neo-runs-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function HistoryPage() {
  const { mode } = useGateway();
  const { records, ledgerError, ledgerCount, reloadLedger } = useMergedHistory();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter(
      (r) =>
        (filter === "all" || outcomeOf(r) === filter) &&
        (!q || r.text.toLowerCase().includes(q) || r.workflowId.includes(q) || r.runId.includes(q)),
    );
  }, [records, filter, query]);

  const selected = records.find((r) => r.runId === selectedId) ?? null;
  const close = useCallback(() => setSelectedId(null), []);

  if (records.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={History}
          title="Todavía no hay runs"
          description="Cada run que ejecutes en el Playground queda aquí con su decisión, sus tiempos y el modo en que corrió."
          action={
            <Button variant="primary" onClick={() => navigate("/runs")} leading={<Play className="size-4" aria-hidden />}>
              Ir al Playground
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <>
      <Panel
        flush
        title={`${records.length} runs`}
        description={
          mode === "live"
            ? ledgerError
              ? `Solo historial local: la bitácora no respondió (${ledgerError}).`
              : `${ledgerCount} de la bitácora decisions (PostgreSQL) + los de este navegador.`
            : "Modo demo: guardados solo en este navegador."
        }
        actions={
          <>
            {mode === "live" && (
              <Button size="sm" variant="ghost" onClick={reloadLedger} leading={<RefreshCw className="size-3.5" aria-hidden />}>
                Actualizar
              </Button>
            )}
            <Button size="sm" onClick={() => exportJSON(filtered)} leading={<Download className="size-3.5" aria-hidden />}>
              Exportar
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (window.confirm("¿Borrar el historial local de este navegador? La bitácora decisions de PostgreSQL no se toca (es append-only).")) clearHistory();
              }}
              leading={<Trash2 className="size-3.5" aria-hidden />}
            >
              Limpiar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 border-b border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar texto, workflow o run_id"
              aria-label="Buscar en el historial"
              className="h-9 pl-9"
            />
          </div>
          <SegmentedControl label="Filtrar por ruta" options={FILTERS} value={filter} onChange={setFilter} size="sm" className="max-sm:w-full" />
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={Search} title="Sin resultados" description="Ningún run coincide con ese filtro." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-subtle">
                  <th scope="col" className="px-5 py-2.5 font-medium">Cuándo</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Workflow</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Documento</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Ruta</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Confianza</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">Latencia</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.runId}
                    className="group cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2/60"
                    onClick={() => setSelectedId(r.runId)}
                  >
                    <td className="px-5 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        className="text-left focus-visible:outline-none"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(r.runId);
                        }}
                        aria-label={`Ver detalle del run ${r.runId}`}
                      >
                        <span className="block text-fg">{relativeTime(r.startedAt)}</span>
                        <span className="font-mono text-[11px] text-fg-subtle">{clockTime(r.startedAt)}</span>
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-xs">{r.workflowId}</span>
                      {r.mode === "demo" && (
                        <Badge tone="accent" className="ml-1.5">
                          demo
                        </Badge>
                      )}
                      {(r.source === "ledger" || r.source === "both") && (
                        <span title="Registrado en la bitácora decisions (PostgreSQL)">
                          <Badge tone="good" icon={Database} className="ml-1.5">
                            bitácora
                          </Badge>
                        </span>
                      )}
                    </td>
                    <td className="max-w-[18rem] px-3 py-3">
                      <p className="truncate text-fg-muted">{r.text}</p>
                    </td>
                    <td className="px-3 py-3">
                      {r.decision && !r.error ? (
                        <RouteBadge route={r.decision.route} short />
                      ) : (
                        <Badge tone="critical" icon={CircleAlert}>
                          Error
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs tabular">{r.decision ? r.decision.confidence.toFixed(2) : "—"}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-fg-muted tabular">{duration(r.totalMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Drawer
        open={selected !== null}
        onClose={close}
        title={selected ? selected.workflowId : ""}
        subtitle={selected && <span className="font-mono">{selected.runId}</span>}
      >
        {selected && <RunDetail record={selected} />}
      </Drawer>
    </>
  );
}
