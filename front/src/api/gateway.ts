import type { Unsubscribe } from "../lib/createStore";
import type {
  FineTuneRequest,
  Health,
  JobEvent,
  LedgerDecision,
  RunEvent,
  StartFineTuneResponse,
  StartRunResponse,
  Workflow,
} from "./types";

export type GatewayMode = "live" | "demo";

/**
 * Strategy: todo lo que la UI necesita de neo-api, sin saber si del otro lado
 * hay un backend real (HTTP + SSE) o una simulación en el navegador.
 * Es el mismo principio que DecideRequest/DecideResponse en el back: Jev y el
 * modelo local intercambiables sin tocar la lógica. Aquí, "en vivo" y "demo".
 */
export interface NeoGateway {
  readonly mode: GatewayMode;
  health(signal?: AbortSignal): Promise<Health>;
  listWorkflows(signal?: AbortSignal): Promise<Workflow[]>;
  startRun(workflow: string, text: string): Promise<StartRunResponse>;
  /** Entrega los eventos del run (incluido el backlog si llegas tarde). Devuelve cómo cancelar. */
  subscribeRun(runId: string, onEvent: (event: RunEvent) => void): Unsubscribe;
  startFineTune(request: FineTuneRequest): Promise<StartFineTuneResponse>;
  subscribeJob(jobId: string, onEvent: (event: JobEvent) => void): Unsubscribe;
  /** Últimas filas de la bitácora `decisions` (GET /api/runs). */
  listRuns(limit?: number, signal?: AbortSignal): Promise<LedgerDecision[]>;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
