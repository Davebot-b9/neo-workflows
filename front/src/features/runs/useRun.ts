import { useCallback, useEffect, useMemo, useReducer } from "react";

import { errorMessage } from "../../api/gateway";
import type { RunEvent } from "../../api/types";
import { useGateway } from "../../app/gateway/gatewayContext";
import { useEventStream } from "../../hooks/useEventStream";
import { recordRun } from "../history/historyStore";
import { initialRunState, runReducer } from "./runReducer";
import { activeRunStore } from "./runSession";

/**
 * Ciclo de vida de un run: POST /api/runs → SSE → reducer → historial.
 * Si hay un run activo de esta sesión (y del mismo modo), lo retoma al montar.
 */
export function useRun() {
  const { gateway, mode } = useGateway();

  const [state, dispatch] = useReducer(runReducer, initialRunState, (initial) => {
    const active = activeRunStore.get();
    if (!active || active.mode !== mode) return initial;
    return runReducer(initial, { type: "resume", ...active });
  });

  const subscribe = useMemo(
    () => (state.runId ? (onEvent: (e: RunEvent) => void) => gateway.subscribeRun(state.runId!, onEvent) : null),
    [gateway, state.runId],
  );
  useEventStream(subscribe, (event) => dispatch({ type: "event", event, at: Date.now() }));

  // Al terminar: se guarda en el historial y deja de ser el run activo.
  useEffect(() => {
    if (state.phase !== "done" && state.phase !== "error") return;
    recordRun(state, mode);
    if (activeRunStore.get()?.runId === state.runId) activeRunStore.set(null);
  }, [state, mode]);

  const start = useCallback(
    async (workflowId: string, text: string) => {
      const startedAt = Date.now();
      dispatch({ type: "start", workflowId, text, at: startedAt });
      try {
        const { run_id: runId } = await gateway.startRun(workflowId, text);
        activeRunStore.set({ runId, workflowId, text, startedAt, mode: gateway.mode });
        dispatch({ type: "started", runId });
      } catch (err) {
        dispatch({ type: "failed", error: errorMessage(err), at: Date.now() });
      }
    },
    [gateway],
  );

  const reset = useCallback(() => {
    activeRunStore.set(null);
    dispatch({ type: "reset" });
  }, []);

  return { state, start, reset };
}
