import { describe, expect, it } from "vitest";

import { effectiveConfidence, overallConfidence, routeFor } from "../../domain/cascade";
import type { JobEvent, RunEvent } from "../types";
import { DEMO_WORKFLOWS } from "./fixtures";
import { createMockGateway } from "./mockGateway";
import { seededRandom, simulateAnswer } from "./simulate";

// Sin latencias: cada "espera" se resuelve en el siguiente tick.
const instant = (fn: () => void) => void setTimeout(fn, 0);

function collect<E extends { type: string }>(subscribe: (cb: (e: E) => void) => () => void, terminal: string[]): Promise<E[]> {
  return new Promise((resolve) => {
    const events: E[] = [];
    const unsubscribe = subscribe((e) => {
      events.push(e);
      if (terminal.includes(e.type)) {
        unsubscribe();
        resolve(events);
      }
    });
  });
}

describe("mock gateway", () => {
  it("emite el mismo orden de eventos que runs/service.go", async () => {
    const gw = createMockGateway({ speed: 0, schedule: instant });
    const { run_id } = await gw.startRun("clasificar-documento", "Factura vencida, pago urgente hoy");
    const events = await collect<RunEvent>((cb) => gw.subscribeRun(run_id, cb), ["run.done", "run.error"]);

    expect(events.map((e) => (e.type === "run.stage" ? `${e.data.name}:${e.data.status}` : e.type))).toEqual([
      "buscar-precedentes:started",
      "buscar-precedentes:done",
      "decidir:started",
      "decidir:done",
      "cascada:started",
      "run.decision",
      "cascada:done",
      "run.done",
    ]);
    expect(events.map((e) => e.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("reproduce el backlog a quien se suscribe después de terminar", async () => {
    const gw = createMockGateway({ speed: 0, schedule: instant });
    const { run_id } = await gw.startRun("clasificar-documento", "Contrato entre partes");
    await collect<RunEvent>((cb) => gw.subscribeRun(run_id, cb), ["run.done"]);
    const late = await collect<RunEvent>((cb) => gw.subscribeRun(run_id, cb), ["run.done"]);
    expect(late).toHaveLength(8);
  });

  it("simula una falla con [falla]", async () => {
    const gw = createMockGateway({ speed: 0, schedule: instant });
    const { run_id } = await gw.startRun("clasificar-documento", "[falla] algo");
    const events = await collect<RunEvent>((cb) => gw.subscribeRun(run_id, cb), ["run.done", "run.error"]);
    expect(events.at(-1)?.type).toBe("run.error");
  });

  it("rechaza workflows inexistentes y modelos 'latest'", async () => {
    const gw = createMockGateway({ speed: 0, schedule: instant });
    await expect(gw.startRun("no-existe", "x")).rejects.toThrow(/no existe/);
    await expect(gw.startFineTune({ base_model: "modelo@latest", dataset_uri: "file:///x", hyperparameters: {} })).rejects.toThrow(/latest/);
  });

  it("entrena hasta max_steps y entrega un adapter_uri", async () => {
    const gw = createMockGateway({ speed: 0, schedule: instant });
    const { job_id } = await gw.startFineTune({ base_model: "onejev-4b@fase0-sim", dataset_uri: "file:///x", hyperparameters: { max_steps: "12" } });
    const events = await collect<JobEvent>((cb) => gw.subscribeJob(job_id, cb), ["job.done", "job.error"]);
    expect(events.filter((e) => e.type === "job.progress")).toHaveLength(12);
    expect(events.at(-1)).toMatchObject({ type: "job.done", data: { job_id } });
  });
});

describe("simulateAnswer (forma System One)", () => {
  const categoria = DEMO_WORKFLOWS[0].questions.categoria;
  const urgente = DEMO_WORKFLOWS[0].questions.urgente;
  const severidad = DEMO_WORKFLOWS[1].questions.severidad;

  it("choice: determinista, suma 1 y `choice` es la más probable", () => {
    const a = simulateAnswer(categoria, "Factura por cobrar", seededRandom("t"));
    const b = simulateAnswer(categoria, "Factura por cobrar", seededRandom("t"));
    expect(a).toEqual(b);
    expect(a.type).toBe("choice");
    const probs = a.probabilities ?? {};
    expect(Object.values(probs).reduce((s, p) => s + p, 0)).toBeCloseTo(1, 3);
    expect(a.choice).toBe(Object.entries(probs).sort(([, x], [, y]) => y - x)[0][0]);
  });

  it("choice: favorece la categoría cuyas palabras aparecen", () => {
    const answer = simulateAnswer(categoria, "Contrato y acuerdo entre las partes", seededRandom("x"));
    expect(answer.choice).toBe("contrato");
  });

  it("noul: solo trae noul, sin probabilities ni confidence", () => {
    const answer = simulateAnswer(urgente, "Pago urgente, vence hoy", seededRandom("u"));
    expect(answer.type).toBe("noul");
    expect(answer.noul).toBeGreaterThan(0.5);
    expect(answer.probabilities).toBeUndefined();
    expect(answer.confidence).toBeUndefined();
  });

  it("score: valor en [0,1], leyenda y probabilidades por nivel", () => {
    const answer = simulateAnswer(severidad, "Falla crítica urgente", seededRandom("s"));
    expect(answer.type).toBe("score");
    expect(answer.score).toBeGreaterThanOrEqual(0);
    expect(answer.score).toBeLessThanOrEqual(1);
    expect(Object.keys(answer.probabilities ?? {})).toEqual(severidad.score_levels);
    expect(answer.legend?.["0"]).toBe("leve");
  });
});

describe("effectiveConfidence / overallConfidence", () => {
  it("replica EffectiveConfidence de Go: noul usa |2p-1|", () => {
    expect(effectiveConfidence({ type: "noul", noul: 0.216 })).toBeCloseTo(0.568, 3);
    expect(effectiveConfidence({ type: "choice", choice: "a", confidence: 0.8 })).toBe(0.8);
  });

  it("toma la menor de todas las preguntas", () => {
    expect(
      overallConfidence({
        a: { type: "choice", choice: "x", confidence: 0.95 },
        b: { type: "noul", noul: 0.216 },
      }),
    ).toBeCloseTo(0.568, 3);
  });
});

describe("routeFor", () => {
  it("replica cascade.Route de Go", () => {
    const cascade = { auto: 0.9, llm: 0.6 };
    expect(routeFor(0.9, cascade)).toBe("auto");
    expect(routeFor(0.89, cascade)).toBe("llm");
    expect(routeFor(0.6, cascade)).toBe("llm");
    expect(routeFor(0.59, cascade)).toBe("review");
  });
});
