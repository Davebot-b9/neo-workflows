import { useCallback, useEffect, useState } from "react";

import { errorMessage } from "../api/gateway";
import type { Health } from "../api/types";
import { useGateway } from "../app/gateway/gatewayContext";

export type SystemStatus = "operational" | "degraded" | "down" | "checking";

export interface HealthState {
  status: SystemStatus;
  health: Health | null;
  error: string | null;
  latencyMs: number | null;
  checkedAt: number | null;
}

const INITIAL: HealthState = { status: "checking", health: null, error: null, latencyMs: null, checkedAt: null };

/** Sondea /healthz (o su doble demo) cada `intervalMs` y al volver a la pestaña. */
export function useHealth(intervalMs = 15_000) {
  const { gateway } = useGateway();
  const [state, setState] = useState<HealthState>(INITIAL);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let controller: AbortController | null = null;

    async function check() {
      controller?.abort();
      controller = new AbortController();
      const t0 = performance.now();
      try {
        const health = await gateway.health(controller.signal);
        setState({
          status: health.ok ? "operational" : "degraded",
          health,
          error: null,
          latencyMs: Math.round(performance.now() - t0),
          checkedAt: Date.now(),
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({ status: "down", health: null, error: errorMessage(err), latencyMs: null, checkedAt: Date.now() });
      }
    }

    void check();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      controller?.abort();
    };
  }, [gateway, intervalMs, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, refresh };
}
