import type { FineTuneRequest, JobEvent } from "../../api/types";
import type { Point } from "../../components/charts/LineChart";

export type JobPhase = "idle" | "starting" | "running" | "done" | "error";

export interface JobState {
  phase: JobPhase;
  jobId: string | null;
  request: FineTuneRequest | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** (step, loss) de cada job.progress. */
  points: Point[];
  maxSteps: number | null;
  eta: string | null;
  adapterUri: string | null;
  error: string | null;
  lastEventId: number;
}

export type JobAction =
  | { type: "start"; request: FineTuneRequest; at: number }
  | { type: "started"; jobId: string }
  | { type: "resume"; jobId: string; request: FineTuneRequest; startedAt: number }
  | { type: "failed"; error: string; at: number }
  | { type: "event"; event: JobEvent; at: number }
  | { type: "reset" };

export const initialJobState: JobState = {
  phase: "idle",
  jobId: null,
  request: null,
  startedAt: null,
  finishedAt: null,
  points: [],
  maxSteps: null,
  eta: null,
  adapterUri: null,
  error: null,
  lastEventId: 0,
};

export function jobReducer(state: JobState, action: JobAction): JobState {
  switch (action.type) {
    case "start":
      return { ...initialJobState, phase: "starting", request: action.request, startedAt: action.at };
    case "started":
      return { ...state, phase: "running", jobId: action.jobId };
    case "resume":
      return { ...initialJobState, phase: "running", jobId: action.jobId, request: action.request, startedAt: action.startedAt };
    case "failed":
      return { ...state, phase: "error", error: action.error, finishedAt: action.at };
    case "reset":
      return initialJobState;
    case "event": {
      const { event, at } = action;
      if (event.id <= state.lastEventId) return state;
      const next = { ...state, lastEventId: event.id };
      switch (event.type) {
        case "job.progress":
          return {
            ...next,
            points: [...state.points, { x: event.data.step, y: event.data.loss }],
            maxSteps: event.data.max_steps,
            eta: event.data.eta,
          };
        case "job.done":
          return { ...next, phase: "done", adapterUri: event.data.adapter_uri, eta: null, finishedAt: at };
        case "job.error":
          return { ...next, phase: "error", error: event.data.error, finishedAt: at };
      }
    }
  }
}

export function bestLoss(points: Point[]): number | null {
  return points.length ? Math.min(...points.map((p) => p.y)) : null;
}
