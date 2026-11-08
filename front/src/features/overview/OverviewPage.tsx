import { ArrowRight, CircleAlert, Gauge, History, Play, Sparkles, Target, Timer, Workflow as WorkflowIcon, Zap } from "lucide-react";

import { useGateway } from "../../app/gateway/gatewayContext";
import { href, navigate } from "../../app/router";
import { LatencyBars } from "../../components/charts/LatencyBars";
import { RouteDistribution } from "../../components/charts/RouteDistribution";
import { RouteBadge } from "../../components/domain/RouteBadge";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { EmptyState, StatTile } from "../../components/ui/misc";
import { Panel } from "../../components/ui/Panel";
import { useHealth } from "../../hooks/useHealth";
import { duration, pct, relativeTime } from "../../lib/format";
import { useMergedHistory } from "../history/useMergedHistory";
import { useWorkflows } from "../workflows/useWorkflows";
import { ArchitectureMap } from "./ArchitectureMap";
import { ContractPanel } from "./ContractPanel";
import { useRunStats } from "./useRunStats";

export function OverviewPage() {
  const health = useHealth();
  const stats = useRunStats();
  const { mode } = useGateway();
  const { workflows } = useWorkflows();

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-panel sm:p-8">
        <div
          className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 65%)" }}
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <Badge tone={mode === "live" ? "good" : "accent"} icon={mode === "live" ? Zap : Sparkles}>
              {mode === "live" ? "Conectado a neo-api" : "Modo demo · simulación local"}
            </Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Decisiones con precedentes,{" "}
              <span className="bg-gradient-to-r from-accent to-signal bg-clip-text text-transparent">de punta a punta.</span>
            </h1>
            <p className="mt-3 text-sm text-pretty text-fg-muted sm:text-base">
              Rust busca casos parecidos, Python responde las preguntas del workflow y Go aplica la cascada:
              automático, LLM o revisión humana. Todo visible en vivo por SSE.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => navigate("/runs")} leading={<Play className="size-4" aria-hidden />}>
              Nuevo run
            </Button>
            <Button onClick={() => navigate("/workflows")} leading={<WorkflowIcon className="size-4" aria-hidden />}>
              {workflows.length || ""} Workflows
            </Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Runs" value={stats.total} hint={`${stats.today} hoy · ${stats.errors} con error`} icon={History} />
        <StatTile label="Decididos en automático" value={stats.autoRate === null ? "—" : pct(stats.autoRate)} hint="sin escalar a LLM ni a persona" icon={Target} />
        <StatTile label="Confianza media" value={stats.meanConfidence === null ? "—" : stats.meanConfidence.toFixed(2)} hint="mínimo por run, promediado" icon={Gauge} />
        <StatTile label="Latencia p50" value={stats.p50Ms === null ? "—" : duration(stats.p50Ms)} hint="de POST a run.done" icon={Timer} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Arquitectura en vivo"
          description={
            mode === "live"
              ? health.checkedAt
                ? `Según /healthz · revisado ${relativeTime(health.checkedAt)}`
                : "Consultando /healthz…"
              : "Topología de los servicios. En modo demo todo se simula en el navegador."
          }
          actions={
            <Button size="sm" variant="ghost" onClick={health.refresh}>
              Revisar
            </Button>
          }
        >
          <ArchitectureMap health={health} />
          {mode === "live" && health.status === "down" && (
            <p className="mt-4 flex items-center gap-2 text-xs text-critical">
              <CircleAlert className="size-3.5" aria-hidden /> {health.error} Levanta el backend con <code className="font-mono">docker compose up</code>.
            </p>
          )}
        </Panel>

        <Panel title="Rutas de la cascada" description="Cómo se reparten las decisiones.">
          {stats.total === 0 ? (
            <p className="py-6 text-center text-sm text-fg-subtle">Sin decisiones todavía.</p>
          ) : (
            <RouteDistribution counts={stats.routes} />
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Latencia por run" description="Últimos 30 runs, de más antiguo a más reciente.">
          {stats.latency.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-subtle">Ejecuta un run para ver su latencia aquí.</p>
          ) : (
            <LatencyBars samples={stats.latency} height={120} />
          )}
        </Panel>
        <ContractPanel health={health} />
      </div>

      <RecentRuns />
    </div>
  );
}

function RecentRuns() {
  const records = useMergedHistory().records.slice(0, 5);

  return (
    <Panel
      flush
      title="Actividad reciente"
      actions={
        records.length > 0 && (
          <a href={href("/history")} className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            Ver historial <ArrowRight className="size-3.5" aria-hidden />
          </a>
        )
      }
    >
      {records.length === 0 ? (
        <EmptyState
          icon={Play}
          title="Aún no hay runs"
          description="Prueba un ejemplo sintético en el Playground: verás cada etapa cruzar los servicios."
          action={
            <Button variant="primary" size="sm" onClick={() => navigate("/runs")}>
              Abrir Playground
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {records.map((r) => (
            <li key={r.runId} className="flex items-center gap-4 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{r.text}</p>
                <p className="mt-0.5 text-xs text-fg-subtle">
                  <span className="font-mono">{r.workflowId}</span> · {relativeTime(r.startedAt)} · {duration(r.totalMs)}
                </p>
              </div>
              {r.decision && !r.error ? (
                <RouteBadge route={r.decision.route} short />
              ) : (
                <Badge tone="critical" icon={CircleAlert}>
                  Error
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
