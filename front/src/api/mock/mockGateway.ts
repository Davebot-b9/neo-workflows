import { overallConfidence, routeFor } from "../../domain/cascade";
import { ApiError, type NeoGateway } from "../gateway";
import type { AnswerPayload, FineTuneRequest, JobEvent, RunEvent, Workflow } from "../types";
import { DEMO_DEPS, DEMO_WORKFLOWS } from "./fixtures";
import { seededRandom, simulateAnswer } from "./simulate";
import { Topic } from "./topic";

// Estrategia "demo": mismo contrato que neo-api (mismos eventos, mismo orden,
// mismo backlog), simulado en el navegador. Sirve mientras el backend, el
// modelo y neo-vector maduran, y como doble de pruebas.

type Schedule = (fn: () => void, ms: number) => void;

interface MockOptions {
  /** Multiplica las latencias simuladas (0 en pruebas). */
  speed?: number;
  workflows?: Workflow[];
  schedule?: Schedule;
}

function wait(schedule: Schedule, ms: number): Promise<void> {
  return new Promise((resolve) => schedule(resolve, ms));
}

function newId(prefix: string): string {
  const raw = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(16).slice(2);
  return `${prefix}-${raw.replace(/-/g, "").slice(0, 12)}`;
}

function formatEta(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

export function createMockGateway(options: MockOptions = {}): NeoGateway {
  const speed = options.speed ?? 1;
  const workflows = options.workflows ?? DEMO_WORKFLOWS;
  const schedule: Schedule = options.schedule ?? ((fn, ms) => void setTimeout(fn, ms));
  const runs = new Map<string, Topic<RunEvent>>();
  const jobs = new Map<string, Topic<JobEvent>>();

  async function simulateRun(runId: string, wf: Workflow, text: string, topic: Topic<RunEvent>) {
    const rand = seededRandom(`${wf.id}:${text}`);
    let seq = 0;
    const emit = (event: Omit<RunEvent, "id">) => topic.publish({ ...event, id: ++seq } as RunEvent);
    const stage = (name: string, status: "started" | "done" | "error", ms: number) =>
      emit({ type: "run.stage", data: { name, status, ms } });

    try {
      await wait(schedule, 60 * speed);
      stage("buscar-precedentes", "started", 0);
      const searchMs = Math.round((90 + rand() * 220) * speed);
      await wait(schedule, searchMs);
      stage("buscar-precedentes", "done", searchMs);

      stage("decidir", "started", 0);
      const decideMs = Math.round((420 + rand() * 900) * speed);
      await wait(schedule, decideMs);
      if (/\[falla\]/i.test(text)) {
        stage("decidir", "error", decideMs);
        emit({ type: "run.error", data: { error: "neo-model: DEADLINE_EXCEEDED (falla simulada con [falla])" } });
        return;
      }
      const answers: Record<string, AnswerPayload> = {};
      for (const [name, question] of Object.entries(wf.questions)) answers[name] = simulateAnswer(question, text, rand);
      stage("decidir", "done", decideMs);

      stage("cascada", "started", 0);
      const confidence = overallConfidence(answers);
      emit({ type: "run.decision", data: { answers, confidence, route: routeFor(confidence, wf.cascade) } });
      const cascadeMs = Math.max(1, Math.round(rand() * 4 * speed));
      await wait(schedule, cascadeMs);
      stage("cascada", "done", cascadeMs);
      emit({ type: "run.done", data: { run_id: runId } });
    } finally {
      topic.close();
    }
  }

  async function simulateJob(jobId: string, request: FineTuneRequest, topic: Topic<JobEvent>) {
    const rand = seededRandom(`${request.base_model}:${request.dataset_uri}:${jobId}`);
    const maxSteps = Math.min(400, Math.max(10, Number(request.hyperparameters.max_steps) || 120));
    const tick = 140 * speed;
    let seq = 0;
    const emit = (event: Omit<JobEvent, "id">) => topic.publish({ ...event, id: ++seq } as JobEvent);

    try {
      for (let step = 1; step <= maxSteps; step++) {
        await wait(schedule, tick);
        const loss = 0.28 + 2.1 * Math.exp(-step / (maxSteps * 0.28)) + (rand() - 0.5) * 0.09;
        emit({
          type: "job.progress",
          data: { step, max_steps: maxSteps, loss: Math.round(loss * 1e4) / 1e4, eta: formatEta(((maxSteps - step) * tick) / 1000) },
        });
      }
      const slug = request.base_model.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      emit({ type: "job.done", data: { job_id: jobId, adapter_uri: `file:///adapters/${slug}/${jobId}` } });
    } finally {
      topic.close();
    }
  }

  return {
    mode: "demo",

    async health() {
      await wait(schedule, 40 * speed);
      return { ok: true, deps: Object.fromEntries(DEMO_DEPS.map((d) => [d, "ok"])) };
    },

    async listWorkflows() {
      await wait(schedule, 120 * speed);
      return workflows;
    },

    async startRun(workflowId, text) {
      await wait(schedule, 80 * speed);
      const wf = workflows.find((w) => w.id === workflowId);
      if (!wf) throw new ApiError(`workflow "${workflowId}" no existe`, 400);
      if (!text.trim()) throw new ApiError("el texto no puede estar vacío", 400);
      const runId = newId("run");
      const topic = new Topic<RunEvent>();
      runs.set(runId, topic);
      void simulateRun(runId, wf, text, topic);
      return { run_id: runId };
    },

    subscribeRun(runId, onEvent) {
      const topic = runs.get(runId);
      if (!topic) {
        const missing = new Topic<RunEvent>();
        missing.publish({ id: 1, type: "run.error", data: { error: `run ${runId} no existe en esta sesión demo` } });
        missing.close();
        return missing.subscribe(onEvent);
      }
      return topic.subscribe(onEvent);
    },

    async startFineTune(request) {
      await wait(schedule, 150 * speed);
      if (!request.base_model.trim()) throw new ApiError("base_model es obligatorio", 400);
      if (/(^|@|:)latest$/i.test(request.base_model.trim())) {
        throw new ApiError("base_model debe ser una versión fija, nunca \"latest\"", 400);
      }
      if (!request.dataset_uri.trim()) throw new ApiError("dataset_uri es obligatorio", 400);
      const jobId = newId("job");
      const topic = new Topic<JobEvent>();
      jobs.set(jobId, topic);
      void simulateJob(jobId, request, topic);
      return { job_id: jobId };
    },

    subscribeJob(jobId, onEvent) {
      const topic = jobs.get(jobId);
      if (!topic) {
        const missing = new Topic<JobEvent>();
        missing.publish({ id: 1, type: "job.error", data: { error: `job ${jobId} no existe en esta sesión demo` } });
        missing.close();
        return missing.subscribe(onEvent);
      }
      return topic.subscribe(onEvent);
    },

    // En demo no hay PostgreSQL: el historial vive solo en el navegador.
    async listRuns() {
      return [];
    },
  };
}
