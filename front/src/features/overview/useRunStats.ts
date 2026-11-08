import { useMemo } from "react";

import type { DecisionRoute } from "../../api/types";
import type { LatencySample } from "../../components/charts/LatencyBars";
import { median } from "../../lib/format";
import { outcomeOf } from "../history/historyStore";
import { useMergedHistory } from "../history/useMergedHistory";

export interface RunStats {
  total: number;
  today: number;
  autoRate: number | null;
  meanConfidence: number | null;
  p50Ms: number | null;
  errors: number;
  routes: Record<DecisionRoute, number>;
  latency: LatencySample[];
}

/** Métricas derivadas del historial (local + bitácora en vivo). La vista solo pinta. */
export function useRunStats(): RunStats {
  const { records } = useMergedHistory();

  return useMemo(() => {
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    const decided = records.filter((r) => r.decision && !r.error);
    const routes: Record<DecisionRoute, number> = { auto: 0, llm: 0, review: 0 };
    decided.forEach((r) => routes[r.decision!.route]++);

    return {
      total: records.length,
      today: records.filter((r) => r.startedAt >= startOfDay).length,
      autoRate: decided.length ? routes.auto / decided.length : null,
      meanConfidence: decided.length ? decided.reduce((s, r) => s + r.decision!.confidence, 0) / decided.length : null,
      p50Ms: decided.length ? median(decided.map((r) => r.totalMs)) : null,
      errors: records.filter((r) => outcomeOf(r) === "error").length,
      routes,
      latency: records
        .slice(0, 30)
        .reverse()
        .map((r) => ({ id: r.runId, ms: r.totalMs, label: r.workflowId })),
    };
  }, [records]);
}
