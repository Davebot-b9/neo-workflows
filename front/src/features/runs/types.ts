import type { DecisionPayload, RunEvent } from "../../api/types";

export type {
  AnswerPayload,
  DecisionPayload as DecisionEvent,
  DecisionRoute,
  RunEvent,
  StagePayload as StageEvent,
} from "../../api/types";

export type RunPhase = "idle" | "starting" | "streaming" | "done" | "error";

export type StageUiStatus = "pending" | "running" | "done" | "error";

export interface StageState {
  name: string;
  status: StageUiStatus;
  /** Duración que reporta neo-api al terminar la etapa. */
  ms: number | null;
  /** Hora local de inicio, para el cronómetro mientras corre. */
  startedAt: number | null;
}

export interface LogEntry {
  at: number;
  event: RunEvent;
}

export interface RunState {
  phase: RunPhase;
  runId: string | null;
  workflowId: string | null;
  text: string;
  startedAt: number | null;
  finishedAt: number | null;
  stages: StageState[];
  decision: DecisionPayload | null;
  error: string | null;
  log: LogEntry[];
  /** Último id de evento aplicado: los repetidos (reconexión, StrictMode) se ignoran. */
  lastEventId: number;
}
