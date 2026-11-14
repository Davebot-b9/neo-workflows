import { ApiError, type NeoGateway } from "./gateway";
import { subscribeSSE } from "./sse";
import {
  type Adapter,
  isHealth,
  JOB_EVENT_TYPES,
  JOB_TERMINAL_EVENTS,
  RUN_EVENT_TYPES,
  RUN_TERMINAL_EVENTS,
  type FineTuneRequest,
  type Health,
  type JobEvent,
  type LedgerDecision,
  type RunEvent,
  type StartFineTuneResponse,
  type StartRunResponse,
  type Workflow,
} from "./types";

// Estrategia "en vivo": habla con neo-api por HTTP (comandos) + SSE (eventos).
// Las rutas son las del brief; el proxy de Vite las manda a :8080.

function hasErrorBody(body: unknown): body is { error: string } {
  return typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("No se pudo conectar con neo-api.", 0);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    // neo-api responde {"error": "..."} en sus errores (writeError en handlers.go).
    const message = hasErrorBody(body) ? body.error : `${init?.method ?? "GET"} ${path} respondió ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

function postJSON<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function createHttpGateway(): NeoGateway {
  return {
    mode: "live",

    async health(signal) {
      // /healthz responde 503 con cuerpo útil cuando una dependencia falla:
      // eso no es un error de transporte, es información para la UI.
      let res: Response;
      try {
        res = await fetch("/healthz", { signal, cache: "no-store" });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        throw new ApiError("neo-api no responde.", 0);
      }
      const body: unknown = await res.json().catch(() => null);
      if (isHealth(body)) return body satisfies Health;
      throw new ApiError(`/healthz respondió ${res.status} sin cuerpo válido.`, res.status);
    },

    listWorkflows: (signal) => request<Workflow[]>("/api/workflows", { signal }),

    startRun: (workflow, text) => postJSON<StartRunResponse>("/api/runs", { workflow, text }),

    subscribeRun: (runId, onEvent) =>
      subscribeSSE<RunEvent>({
        url: `/api/runs/${encodeURIComponent(runId)}/events`,
        types: RUN_EVENT_TYPES,
        terminal: RUN_TERMINAL_EVENTS,
        onEvent,
        connectionLost: (error) => ({ id: Number.MAX_SAFE_INTEGER, type: "run.error", data: { error } }),
      }),

    startFineTune: (body: FineTuneRequest) => postJSON<StartFineTuneResponse>("/api/jobs/finetune", body),

    subscribeJob: (jobId, onEvent) =>
      subscribeSSE<JobEvent>({
        url: `/api/jobs/${encodeURIComponent(jobId)}/events`,
        types: JOB_EVENT_TYPES,
        terminal: JOB_TERMINAL_EVENTS,
        onEvent,
        connectionLost: (error) => ({ id: Number.MAX_SAFE_INTEGER, type: "job.error", data: { error } }),
      }),

    listRuns: (limit = 100, signal) => request<LedgerDecision[]>(`/api/runs?limit=${limit}`, { signal }),

    listAdapters: (signal) => request<Adapter[]>("/api/adapters", { signal }),
  };
}
