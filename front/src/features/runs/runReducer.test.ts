import { describe, expect, it } from "vitest";

import type { RunEvent } from "../../api/types";
import { initialRunState, runReducer } from "./runReducer";

const stage = (id: number, name: string, status: "started" | "done" | "error", ms = 0): RunEvent => ({
  id,
  type: "run.stage",
  data: { name, status, ms },
});

function play(events: RunEvent[]) {
  let state = runReducer(initialRunState, { type: "start", workflowId: "wf", text: "hola", at: 0 });
  state = runReducer(state, { type: "started", runId: "run-1" });
  events.forEach((event, i) => {
    state = runReducer(state, { type: "event", event, at: (i + 1) * 10 });
  });
  return state;
}

describe("runReducer", () => {
  it("recorre el pipeline completo hasta done", () => {
    const state = play([
      stage(1, "buscar-precedentes", "started"),
      stage(2, "buscar-precedentes", "done", 120),
      stage(3, "decidir", "started"),
      stage(4, "decidir", "done", 800),
      stage(5, "cascada", "started"),
      { id: 6, type: "run.decision", data: { answers: {}, confidence: 0.93, route: "auto" } },
      stage(7, "cascada", "done", 1),
      { id: 8, type: "run.done", data: { run_id: "run-1" } },
    ]);

    expect(state.phase).toBe("done");
    expect(state.decision?.route).toBe("auto");
    expect(state.stages.map((s) => [s.name, s.status, s.ms])).toEqual([
      ["buscar-precedentes", "done", 120],
      ["decidir", "done", 800],
      ["cascada", "done", 1],
    ]);
    expect(state.log).toHaveLength(8);
  });

  it("ignora eventos repetidos (backlog reproducido al reconectar)", () => {
    const first = stage(1, "buscar-precedentes", "started");
    const state = play([first, stage(2, "buscar-precedentes", "done", 50), first, stage(2, "buscar-precedentes", "done", 50)]);
    expect(state.log).toHaveLength(2);
    expect(state.stages[0].status).toBe("done");
  });

  it("marca como error la etapa que estaba corriendo cuando llega run.error", () => {
    const state = play([stage(1, "buscar-precedentes", "started"), { id: 2, type: "run.error", data: { error: "vector caído" } }]);
    expect(state.phase).toBe("error");
    expect(state.error).toBe("vector caído");
    expect(state.stages[0].status).toBe("error");
    expect(state.stages[1].status).toBe("pending");
  });

  it("agrega etapas que el front no conoce en lugar de perderlas", () => {
    const state = play([stage(1, "reranking", "started")]);
    expect(state.stages.at(-1)).toMatchObject({ name: "reranking", status: "running" });
  });
});
