import { useCallback, useReducer } from "react";

import { runEventsURL, startRun } from "../../api/client";
import { useEventStream } from "../../hooks/useEventStream";
import { RUN_EVENT_TYPES, type DecisionEvent, type ErrorEvent, type StageEvent } from "./types";

interface RunState {
  runId: string | null;
  stages: StageEvent[];
  decision: DecisionEvent | null;
  error: string | null;
  done: boolean;
}

type Action =
  | { type: "reset"; runId: string }
  | { type: "stage"; stage: StageEvent }
  | { type: "decision"; decision: DecisionEvent }
  | { type: "done" }
  | { type: "error"; error: string };

const initialState: RunState = { runId: null, stages: [], decision: null, error: null, done: false };

// useReducer de etapas: el estado del run en la UI vive en un solo lugar,
// actualizado por los eventos que llegan de useEventStream.
function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case "reset":
      return { ...initialState, runId: action.runId };
    case "stage":
      return { ...state, stages: [...state.stages, action.stage] };
    case "decision":
      return { ...state, decision: action.decision };
    case "done":
      return { ...state, done: true };
    case "error":
      return { ...state, error: action.error, done: true };
  }
}

export function useRun() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const onEvent = useCallback((type: string, data: unknown) => {
    switch (type) {
      case "run.stage":
        dispatch({ type: "stage", stage: data as StageEvent });
        break;
      case "run.decision":
        dispatch({ type: "decision", decision: data as DecisionEvent });
        break;
      case "run.done":
        dispatch({ type: "done" });
        break;
      case "run.error":
        dispatch({ type: "error", error: (data as ErrorEvent).error });
        break;
    }
  }, []);

  useEventStream(state.runId ? runEventsURL(state.runId) : null, RUN_EVENT_TYPES, onEvent);

  const run = useCallback(async (workflow: string, text: string) => {
    const { run_id: runId } = await startRun(workflow, text);
    dispatch({ type: "reset", runId });
  }, []);

  return { ...state, run };
}
