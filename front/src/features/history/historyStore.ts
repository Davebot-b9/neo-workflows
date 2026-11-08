import type { GatewayMode } from "../../api/gateway";
import type { DecisionPayload, LedgerDecision, StagePayload } from "../../api/types";
import { createStore, useStore } from "../../lib/createStore";
import { readJSON, writeJSON } from "../../lib/storage";
import type { RunState } from "../runs/types";

// Historial local de runs (este navegador). En vivo se combina con la
// bitácora de PostgreSQL (GET /api/runs, ver useMergedHistory): la bitácora
// no guarda etapas ni errores, el local sí.

export interface RunRecord {
  runId: string;
  workflowId: string;
  mode: GatewayMode;
  text: string;
  startedAt: number;
  totalMs: number;
  stages: StagePayload[];
  decision: DecisionPayload | null;
  error: string | null;
  /** De dónde viene: este navegador, la bitácora de PostgreSQL, o ambos. */
  source?: "local" | "ledger" | "both";
}

const KEY = "neo.history.v1";
const MAX = 200;

function load(): RunRecord[] {
  const raw = readJSON<unknown>(KEY, []);
  return Array.isArray(raw) ? (raw.filter((r) => typeof r === "object" && r && "runId" in r) as RunRecord[]) : [];
}

export const historyStore = createStore<RunRecord[]>(load(), (records) => writeJSON(KEY, records));

export const useHistory = () => useStore(historyStore);

/** Idempotente por runId: volver a la página no duplica el registro. */
export function recordRun(state: RunState, mode: GatewayMode): void {
  if (!state.runId || !state.workflowId || state.startedAt === null) return;
  const record: RunRecord = {
    runId: state.runId,
    workflowId: state.workflowId,
    mode,
    text: state.text,
    startedAt: state.startedAt,
    totalMs: Math.max(0, (state.finishedAt ?? Date.now()) - state.startedAt),
    stages: state.stages
      .filter((s) => s.status === "done" || s.status === "error")
      .map((s) => ({ name: s.name, status: s.status === "done" ? "done" : "error", ms: s.ms ?? 0 })),
    decision: state.decision,
    error: state.error,
  };
  historyStore.set((records) => [record, ...records.filter((r) => r.runId !== record.runId)].slice(0, MAX));
}

export function clearHistory(): void {
  historyStore.set([]);
}

export type RecordOutcome = "auto" | "llm" | "review" | "error";

export function outcomeOf(record: RunRecord): RecordOutcome {
  if (record.error || !record.decision) return "error";
  return record.decision.route;
}

/** Fila de `decisions` → registro de la UI. La bitácora no guarda etapas ni errores, solo decisiones. */
export function recordFromLedger(row: LedgerDecision): RunRecord {
  return {
    runId: row.run_id,
    workflowId: row.workflow_id,
    mode: "live",
    text: row.input_text,
    startedAt: Date.parse(row.created_at),
    totalMs: row.latency_ms,
    stages: [],
    decision: { answers: row.answers, confidence: row.confidence, route: row.route },
    error: null,
    source: "ledger",
  };
}

/**
 * Une el historial local con la bitácora: la bitácora es la fuente de verdad
 * de la decisión; el registro local aporta lo que la bitácora no guarda
 * (etapas, latencia total, errores, runs demo).
 */
export function mergeHistory(local: RunRecord[], ledger: RunRecord[]): RunRecord[] {
  const byId = new Map<string, RunRecord>();
  for (const r of local) byId.set(r.runId, { ...r, source: "local" });
  for (const r of ledger) {
    const mine = byId.get(r.runId);
    byId.set(r.runId, mine ? { ...mine, decision: r.decision ?? mine.decision, source: "both" } : r);
  }
  return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt);
}
