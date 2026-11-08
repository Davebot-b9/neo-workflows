import { describe, expect, it } from "vitest";

import { bestLoss, initialJobState, jobReducer } from "./jobReducer";

const request = { base_model: "onejev-4b@fase0-sim", dataset_uri: "file:///x.jsonl", hyperparameters: {} };

describe("jobReducer", () => {
  it("acumula puntos de loss y termina con el adaptador", () => {
    let state = jobReducer(initialJobState, { type: "start", request, at: 0 });
    state = jobReducer(state, { type: "started", jobId: "job-1" });
    state = jobReducer(state, { type: "event", at: 1, event: { id: 1, type: "job.progress", data: { step: 1, max_steps: 2, loss: 2.1, eta: "1s" } } });
    state = jobReducer(state, { type: "event", at: 2, event: { id: 2, type: "job.progress", data: { step: 2, max_steps: 2, loss: 1.4, eta: "0s" } } });
    state = jobReducer(state, { type: "event", at: 3, event: { id: 3, type: "job.done", data: { job_id: "job-1", adapter_uri: "file:///a" } } });

    expect(state.phase).toBe("done");
    expect(state.points).toEqual([
      { x: 1, y: 2.1 },
      { x: 2, y: 1.4 },
    ]);
    expect(state.adapterUri).toBe("file:///a");
    expect(bestLoss(state.points)).toBe(1.4);
  });

  it("no duplica pasos repetidos", () => {
    const progress = { id: 1, type: "job.progress" as const, data: { step: 1, max_steps: 5, loss: 2, eta: "4s" } };
    let state = jobReducer(initialJobState, { type: "started", jobId: "job-1" });
    state = jobReducer(state, { type: "event", at: 1, event: progress });
    state = jobReducer(state, { type: "event", at: 2, event: progress });
    expect(state.points).toHaveLength(1);
  });
});
