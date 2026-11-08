import type { GatewayMode } from "../../api/gateway";
import type { Tone } from "../../domain/meta";
import type { HealthState } from "../../hooks/useHealth";

export type ServiceId = "web" | "neo-api" | "neo-vector" | "neo-model" | "postgres";

export interface ServiceInfo {
  id: ServiceId;
  name: string;
  tech: string;
  role: string;
}

export const SERVICES: Record<ServiceId, ServiceInfo> = {
  web: { id: "web", name: "web", tech: "TypeScript · React", role: "Esta interfaz" },
  "neo-api": { id: "neo-api", name: "neo-api", tech: "Go", role: "Negocio · HTTP + SSE" },
  "neo-vector": { id: "neo-vector", name: "neo-vector", tech: "Rust", role: "Embeddings y búsqueda" },
  "neo-model": { id: "neo-model", name: "neo-model", tech: "Python", role: "Inferencia y fine-tuning" },
  postgres: { id: "postgres", name: "PostgreSQL", tech: "18.6", role: "Bitácora decisions" },
};

export interface ServiceStatus {
  tone: Tone;
  label: string;
  detail?: string;
}

/**
 * Estado de cada servicio según /healthz (postgres, neo-vector y neo-model
 * en deps). Si un neo-api viejo no reporta alguno, aparece como "sin sonda".
 */
export function serviceStatus(id: ServiceId, health: HealthState, mode: GatewayMode): ServiceStatus {
  if (id === "web") return { tone: "good", label: "Activo" };
  if (mode === "demo") return { tone: "accent", label: "Simulado" };
  if (health.status === "checking") return { tone: "neutral", label: "Revisando…" };
  if (id === "neo-api") {
    return health.status === "down"
      ? { tone: "critical", label: "Sin respuesta", detail: health.error ?? undefined }
      : { tone: "good", label: "Activo", detail: health.latencyMs !== null ? `${health.latencyMs} ms` : undefined };
  }
  if (health.status === "down") return { tone: "neutral", label: "Desconocido", detail: "neo-api no responde" };
  const dep = health.health?.deps[id];
  if (dep === undefined) return { tone: "neutral", label: "Sin sonda", detail: "neo-api aún no lo revisa en /healthz" };
  return dep === "ok" ? { tone: "good", label: "Activo" } : { tone: "critical", label: "Falla", detail: dep };
}
