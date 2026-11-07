import type { DecisionEvent, StageEvent } from "./types";

interface TimelineProps {
  stages: StageEvent[];
  decision: DecisionEvent | null;
  error: string | null;
  done: boolean;
}

export function Timeline({ stages, decision, error, done }: TimelineProps) {
  return (
    <div className="timeline">
      <ol>
        {stages.map((stage, i) => (
          <li key={`${stage.name}-${i}`} data-status={stage.status}>
            {stage.name} — {stage.status} ({stage.ms} ms)
          </li>
        ))}
      </ol>

      {decision && (
        <div className="decision">
          <strong>Ruta: {decision.route}</strong> (confianza {decision.confidence.toFixed(2)})
          <ul>
            {Object.entries(decision.answers).map(([name, answer]) => (
              <li key={name}>
                {name}: {JSON.stringify(answer.probabilities)} (confianza {answer.confidence.toFixed(2)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {done && !error && <p className="done">Run terminado.</p>}
    </div>
  );
}
