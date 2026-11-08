import { useGateway } from "../../app/gateway/gatewayContext";
import { Badge, TONE_TEXT } from "../../components/ui/Badge";
import { Panel } from "../../components/ui/Panel";
import type { Tone } from "../../domain/meta";
import type { HealthState } from "../../hooks/useHealth";
import { cn } from "../../lib/cn";
import { useMergedHistory } from "../history/useMergedHistory";
import { useWorkflows } from "../workflows/useWorkflows";

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  tone: Tone;
  status: string;
}

/**
 * Qué tan listo está el backend para esta UI: cada ruta del contrato con la
 * última evidencia que tenemos de ella (en vivo) o "simulado" (demo).
 */
export function ContractPanel({ health }: { health: HealthState }) {
  const { mode } = useGateway();
  const { workflows, error: wfError, loading: wfLoading } = useWorkflows();
  const { records, ledgerError, ledgerCount } = useMergedHistory();
  const lastLive = records.find((r) => r.mode === "live");

  const sim: Pick<Endpoint, "tone" | "status"> = { tone: "accent", status: "simulado" };
  const live = (ok: boolean | null, okText: string, failText: string): Pick<Endpoint, "tone" | "status"> =>
    ok === null ? { tone: "neutral", status: "sin probar" } : ok ? { tone: "good", status: okText } : { tone: "critical", status: failText };

  const endpoints: Endpoint[] = [
    {
      method: "GET",
      path: "/healthz",
      ...(mode === "demo" ? sim : live(health.status === "checking" ? null : health.status !== "down", health.status === "degraded" ? "503 · degradado" : "200", "sin respuesta")),
    },
    {
      method: "GET",
      path: "/api/workflows",
      ...(mode === "demo" ? sim : live(wfLoading && workflows.length === 0 ? null : !wfError, `${workflows.length} cargados`, "falló")),
    },
    {
      method: "POST",
      path: "/api/runs → SSE",
      ...(mode === "demo" ? sim : live(lastLive ? !lastLive.error : null, "último run ok", "último run falló")),
    },
    {
      method: "GET",
      path: "/api/runs",
      ...(mode === "demo" ? sim : live(ledgerError ? false : ledgerCount > 0 ? true : null, `${ledgerCount} en bitácora`, "falló")),
    },
    { method: "POST", path: "/api/jobs/finetune → SSE", ...(mode === "demo" ? sim : { tone: "neutral", status: "por probar" }) },
  ];

  return (
    <Panel title="Contrato con neo-api" description="Rutas del brief que esta UI ya consume.">
      <ul className="flex flex-col gap-2.5">
        {endpoints.map((e) => (
          <li key={e.path} className="flex items-center gap-2 text-xs">
            <Badge mono tone={e.method === "GET" ? "neutral" : "accent"} className="w-11 justify-center">
              {e.method}
            </Badge>
            <span className="min-w-0 flex-1 truncate font-mono text-fg-muted">{e.path}</span>
            <span className={cn("shrink-0 font-medium", TONE_TEXT[e.tone])}>{e.status}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
