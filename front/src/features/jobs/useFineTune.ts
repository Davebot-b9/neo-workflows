import { useCallback, useEffect, useMemo, useReducer } from "react";

import { errorMessage, type GatewayMode } from "../../api/gateway";
import type { FineTuneRequest, JobEvent } from "../../api/types";
import { useGateway } from "../../app/gateway/gatewayContext";
import { useEventStream } from "../../hooks/useEventStream";
import { createStore } from "../../lib/createStore";
import { initialJobState, jobReducer } from "./jobReducer";

interface ActiveJob {
  jobId: string;
  request: FineTuneRequest;
  startedAt: number;
  mode: GatewayMode;
}

/** Job en curso de esta pestaña: un fine-tune dura minutos y el usuario va a navegar mientras tanto. */
const activeJobStore = createStore<ActiveJob | null>(null);

/** POST /api/jobs/finetune → SSE job.* → reducer. Retoma el job activo al volver a la página. */
export function useFineTune() {
  const { gateway, mode } = useGateway();

  const [state, dispatch] = useReducer(jobReducer, initialJobState, (initial) => {
    const active = activeJobStore.get();
    if (!active || active.mode !== mode) return initial;
    return jobReducer(initial, { type: "resume", ...active });
  });

  const subscribe = useMemo(
    () => (state.jobId ? (onEvent: (e: JobEvent) => void) => gateway.subscribeJob(state.jobId!, onEvent) : null),
    [gateway, state.jobId],
  );
  useEventStream(subscribe, (event) => dispatch({ type: "event", event, at: Date.now() }));

  useEffect(() => {
    if ((state.phase === "done" || state.phase === "error") && activeJobStore.get()?.jobId === state.jobId) {
      activeJobStore.set(null);
    }
  }, [state.phase, state.jobId]);

  const start = useCallback(
    async (request: FineTuneRequest) => {
      const startedAt = Date.now();
      dispatch({ type: "start", request, at: startedAt });
      try {
        const { job_id: jobId } = await gateway.startFineTune(request);
        activeJobStore.set({ jobId, request, startedAt, mode: gateway.mode });
        dispatch({ type: "started", jobId });
      } catch (err) {
        dispatch({ type: "failed", error: errorMessage(err), at: Date.now() });
      }
    },
    [gateway],
  );

  const reset = useCallback(() => {
    activeJobStore.set(null);
    dispatch({ type: "reset" });
  }, []);

  return { state, start, reset };
}
