export interface Workflow {
  id: string;
  version: number;
  provider: string;
  model: string;
}

export interface StartRunResponse {
  run_id: string;
}

export async function listWorkflows(): Promise<Workflow[]> {
  const res = await fetch("/api/workflows");
  if (!res.ok) throw new Error(`GET /api/workflows: ${res.status}`);
  return res.json();
}

export async function startRun(workflow: string, text: string): Promise<StartRunResponse> {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow, text }),
  });
  if (!res.ok) throw new Error(`POST /api/runs: ${res.status}`);
  return res.json();
}

export function runEventsURL(runId: string): string {
  return `/api/runs/${runId}/events`;
}
