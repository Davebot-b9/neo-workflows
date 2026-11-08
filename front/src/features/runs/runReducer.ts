import { PIPELINE_STAGES } from "../../domain/meta";
import type { RunEvent, RunState, StageState } from "./types";

export type RunAction =
  | { type: "start"; workflowId: string; text: string; at: number }
  | { type: "started"; runId: string }
  | { type: "resume"; runId: string; workflowId: string; text: string; startedAt: number }
  | { type: "failed"; error: string; at: number }
  | { type: "event"; event: RunEvent; at: number }
  | { type: "reset" };

const pendingStages = (): StageState[] =>
  PIPELINE_STAGES.map((s) => ({ name: s.id, status: "pending", ms: null, startedAt: null }));

export const initialRunState: RunState = {
  phase: "idle",
  runId: null,
  workflowId: null,
  text: "",
  startedAt: null,
  finishedAt: null,
  stages: pendingStages(),
  decision: null,
  error: null,
  log: [],
  lastEventId: 0,
};

function applyStage(stages: StageState[], event: Extract<RunEvent, { type: "run.stage" }>, at: number): StageState[] {
  const { name, status, ms } = event.data;
  const exists = stages.some((s) => s.name === name);
  const base = exists ? stages : [...stages, { name, status: "pending" as const, ms: null, startedAt: null }];
  return base.map((s) => {
    if (s.name !== name) return s;
    if (status === "started") return { ...s, status: "running", startedAt: at, ms: null };
    return { ...s, status: status === "done" ? "done" : "error", ms };
  });
}

/** Estado de un run en la UI: un solo lugar, alimentado solo por eventos. Puro y probado. */
export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "start":
      return { ...initialRunState, stages: pendingStages(), phase: "starting", workflowId: action.workflowId, text: action.text, startedAt: action.at };
    case "started":
      return { ...state, phase: "streaming", runId: action.runId };
    case "resume":
      return {
        ...initialRunState,
        stages: pendingStages(),
        phase: "streaming",
        runId: action.runId,
        workflowId: action.workflowId,
        text: action.text,
        startedAt: action.startedAt,
      };
    case "failed":
      return { ...state, phase: "error", error: action.error, finishedAt: action.at };
    case "reset":
      return { ...initialRunState, stages: pendingStages() };
    case "event": {
      const { event, at } = action;
      if (event.id <= state.lastEventId) return state;
      const next: RunState = { ...state, lastEventId: event.id, log: [...state.log, { at, event }] };
      switch (event.type) {
        case "run.stage":
          return { ...next, stages: applyStage(state.stages, event, at) };
        case "run.decision":
          return { ...next, decision: event.data };
        case "run.done":
          return { ...next, phase: "done", finishedAt: at };
        case "run.error":
          return {
            ...next,
            phase: "error",
            error: event.data.error,
            finishedAt: at,
            stages: state.stages.map((s) => (s.status === "running" ? { ...s, status: "error" } : s)),
          };
      }
    }
  }
}

export function isActive(state: RunState): boolean {
  return state.phase === "starting" || state.phase === "streaming";
}
