import { Fragment } from "react";

import { useGateway } from "../../app/gateway/gatewayContext";
import { TONE_TEXT } from "../../components/ui/Badge";
import { StatusDot } from "../../components/ui/StatusDot";
import type { HealthState } from "../../hooks/useHealth";
import { cn } from "../../lib/cn";
import { SERVICES, serviceStatus, type ServiceId } from "./services";

const BACKENDS: ServiceId[] = ["neo-vector", "neo-model", "postgres"];

/** Topología en vivo: TS → Go → (Rust, Python, Postgres), coloreada por /healthz. */
export function ArchitectureMap({ health }: { health: HealthState }) {
  const { mode } = useGateway();
  const apiUp = mode === "demo" || health.status === "operational" || health.status === "degraded";

  return (
    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)_2.5rem_minmax(0,1fr)] md:grid-rows-3 md:gap-y-3">
      <Node id="web" health={health} className="md:row-span-3 md:self-center" />
      <Edge active={apiUp} className="md:row-span-3" label="HTTP + SSE" />
      <Node id="neo-api" health={health} highlight className="md:row-span-3 md:self-center" />

      {/* Corchete hacia los tres backends (solo escritorio) */}
      <div className="relative hidden md:row-span-3 md:block" aria-hidden>
        <span className={cn("absolute top-1/2 left-0 h-0.5 w-1/2 -translate-y-1/2", apiUp ? "flow-line" : "bg-line")} />
        <span className="absolute top-[16.66%] bottom-[16.66%] left-1/2 w-0.5 -translate-x-1/2 bg-line-strong" />
        {[16.66, 50, 83.33].map((top) => (
          <span key={top} className={cn("absolute right-0 h-0.5 w-1/2 -translate-y-1/2", apiUp ? "flow-line" : "bg-line")} style={{ top: `${top}%` }} />
        ))}
      </div>
      <Edge active={apiUp} className="md:hidden" label="gRPC (h2c) · SQL" />

      <div className="grid gap-2 max-md:grid-cols-1 sm:max-md:grid-cols-3 md:contents">
        {BACKENDS.map((id) => (
          <Fragment key={id}>
            <Node id={id} health={health} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Node({ id, health, highlight, className }: { id: ServiceId; health: HealthState; highlight?: boolean; className?: string }) {
  const { mode } = useGateway();
  const info = SERVICES[id];
  const status = serviceStatus(id, health, mode);

  return (
    <div
      className={cn(
        "relative min-w-0 rounded-xl border bg-surface p-3 transition-colors",
        highlight ? "border-accent/40 shadow-[0_0_0_4px_var(--glow)]" : "border-line",
        className,
      )}
      title={status.detail}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-mono text-sm font-medium">{info.name}</p>
        <StatusDot tone={status.tone} pulse={status.tone === "good" && id === "neo-api"} />
      </div>
      <p className="mt-0.5 truncate text-[11px] text-fg-subtle">{info.tech}</p>
      <p className="mt-2 truncate text-xs text-fg-muted">{info.role}</p>
      <p className={cn("mt-1 truncate text-[11px] font-medium", TONE_TEXT[status.tone])}>
        {status.label}
        {status.detail && <span className="font-normal text-fg-subtle"> · {status.detail}</span>}
      </p>
    </div>
  );
}

function Edge({ active, label, className }: { active: boolean; label: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center max-md:h-8 max-md:gap-2", className)} aria-hidden>
      <span className={cn("rounded-full max-md:h-full max-md:w-0.5 md:h-0.5 md:w-full", active ? "flow-line" : "bg-line")} />
      <span className="font-mono text-[10px] text-fg-subtle md:hidden">{label}</span>
    </div>
  );
}
