import { describe, expect, it } from "vitest";

import { mergeHistory, recordFromLedger, type RunRecord } from "./historyStore";

const local = (runId: string, startedAt: number, extra: Partial<RunRecord> = {}): RunRecord => ({
  runId,
  workflowId: "wf",
  mode: "live",
  text: "texto",
  startedAt,
  totalMs: 900,
  stages: [{ name: "decidir", status: "done", ms: 500 }],
  decision: null,
  error: null,
  ...extra,
});

describe("mergeHistory", () => {
  const ledgerRow = recordFromLedger({
    run_id: "a",
    workflow_id: "wf",
    workflow_version: 1,
    provider: "local",
    model: "m",
    input_text: "texto",
    answers: { urgente: { type: "noul", noul: 0.9 } },
    confidence: 0.8,
    route: "llm",
    latency_ms: 300,
    created_at: "2026-11-08T00:00:00Z",
  });

  it("la bitácora manda en la decisión; el local aporta etapas y latencia total", () => {
    const [merged] = mergeHistory([local("a", 1)], [ledgerRow]);
    expect(merged.source).toBe("both");
    expect(merged.decision?.route).toBe("llm");
    expect(merged.stages).toHaveLength(1);
    expect(merged.totalMs).toBe(900);
  });

  it("incluye filas que solo existen en la bitácora y ordena por fecha", () => {
    const merged = mergeHistory([local("b", Date.parse("2026-11-09T00:00:00Z"))], [ledgerRow]);
    expect(merged.map((r) => [r.runId, r.source])).toEqual([
      ["b", "local"],
      ["a", "ledger"],
    ]);
  });
});
