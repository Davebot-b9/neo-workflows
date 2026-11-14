// Formas JSON del contrato Front → neo-api (ver back/internal/httpapi,
// back/internal/runs/events.go y back/internal/jobs/service.go).
// Si cambian allá, cambian aquí: este archivo es el espejo del contrato.

export type QuestionType = "choice" | "noul" | "score";

export interface Question {
  type: QuestionType | (string & {});
  instructions: string;
  /** choice: opción → descripción. */
  criteria?: Record<string, string>;
  /** score: niveles ordenados (el índice es el valor). */
  score_levels?: string[];
  /** noul: etiquetas opcionales para verdadero/falso. */
  noul_true?: string;
  noul_false?: string;
}

export interface Workflow {
  id: string;
  version: number;
  provider: "local" | "jev" | (string & {});
  model: string;
  /** job_id de un adaptador LoRA entrenado (solo provider local); ausente = modelo base. */
  adapter?: string;
  search: { top_k: number };
  questions: Record<string, Question>;
  cascade: { auto: number; llm: number };
}

export interface Health {
  ok: boolean;
  deps: Record<string, string>;
}

// ── Runs ──────────────────────────────────────────────────────────────

export type StageStatus = "started" | "done" | "error";

export interface StagePayload {
  name: string;
  status: StageStatus;
  ms: number;
}

/**
 * Forma real del API System One (ver back/internal/runs/events.go y la nota
 * de Contratos en CLAUDE.md): los campos dependen de `type`.
 * - noul:   solo `noul` (P(verdadero)); no trae confidence propio.
 * - choice: `choice` + `probabilities` + `confidence`.
 * - score:  `score` + `legend` + `probabilities` + `confidence`.
 */
export interface AnswerPayload {
  type?: QuestionType;
  noul?: number;
  choice?: string;
  score?: number;
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
  confidence?: number;
}

export type DecisionRoute = "auto" | "llm" | "review";

export interface DecisionPayload {
  answers: Record<string, AnswerPayload>;
  confidence: number;
  route: DecisionRoute;
}

export interface StartRunResponse {
  run_id: string;
}

/** Sobre común de un evento SSE: `id` es el id: del stream (sirve para descartar repeticiones). */
type Envelope<T extends string, D> = { id: number; type: T; data: D };

export type RunEvent =
  | Envelope<"run.stage", StagePayload>
  | Envelope<"run.decision", DecisionPayload>
  | Envelope<"run.done", { run_id: string }>
  | Envelope<"run.error", { error: string }>;

export const RUN_EVENT_TYPES = ["run.stage", "run.decision", "run.done", "run.error"] as const;
export const RUN_TERMINAL_EVENTS = ["run.done", "run.error"] as const;

// ── Jobs (fine-tuning) ───────────────────────────────────────────────

export interface FineTuneRequest {
  base_model: string;
  dataset_uri: string;
  hyperparameters: Record<string, string>;
}

export interface StartFineTuneResponse {
  job_id: string;
}

export interface JobProgressPayload {
  step: number;
  max_steps: number;
  loss: number;
  eta: string;
}

export type JobEvent =
  | Envelope<"job.progress", JobProgressPayload>
  | Envelope<"job.done", { job_id: string; adapter_uri: string }>
  | Envelope<"job.error", { error: string }>;

export const JOB_EVENT_TYPES = ["job.progress", "job.done", "job.error"] as const;
export const JOB_TERMINAL_EVENTS = ["job.done", "job.error"] as const;

/** Un adaptador LoRA que dejó un fine-tuning (GET /api/adapters). Su `id` es lo
 *  que un workflow pone en `adapter:` (ver workflows/*.yaml). */
export interface Adapter {
  id: string;
  base_model: string;
  dataset_uri: string;
  hyperparameters: Record<string, string>;
  adapter_uri: string;
  created_at: string;
}

// ── Bitácora (GET /api/runs) ─────────────────────────────────────────

/** Una fila de la tabla append-only `decisions`. */
export interface LedgerDecision {
  run_id: string;
  workflow_id: string;
  workflow_version: number;
  provider: string;
  model: string;
  /** Adaptador LoRA que usó la decisión; ausente = modelo base. */
  adapter?: string;
  input_text: string;
  answers: Record<string, AnswerPayload>;
  confidence: number;
  route: DecisionRoute;
  latency_ms: number;
  created_at: string;
}

export function isHealth(value: unknown): value is Health {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Health).ok === "boolean" &&
    typeof (value as Health).deps === "object"
  );
}
