import { useEffect, useState } from "react";

import { listWorkflows, type Workflow } from "../../api/client";
import { Timeline } from "./Timeline";
import { useRun } from "./useRun";

export function RunForm() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workflowId, setWorkflowId] = useState("");
  const [text, setText] = useState("");
  const { run, stages, decision, error, done, runId } = useRun();

  useEffect(() => {
    listWorkflows()
      .then((items) => {
        setWorkflows(items);
        setWorkflowId(items[0]?.id ?? "");
      })
      .catch((err: unknown) => console.error("listWorkflows:", err));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workflowId || !text.trim()) return;
    await run(workflowId, text);
  }

  return (
    <section>
      <h2>Clasificar con precedentes</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Workflow
          <select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}>
            {workflows.map((wf) => (
              <option key={wf.id} value={wf.id}>
                {wf.id} (v{wf.version})
              </option>
            ))}
          </select>
        </label>
        <label>
          Texto
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
        </label>
        <button type="submit">Iniciar run</button>
      </form>

      {runId && (
        <>
          <p>
            run_id: <code>{runId}</code>
          </p>
          <Timeline stages={stages} decision={decision} error={error} done={done} />
        </>
      )}
    </section>
  );
}
