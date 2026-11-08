import type { AnswerPayload, Question } from "../../api/types";
import { ProbabilityBars } from "../../components/charts/ProbabilityBars";
import { Badge } from "../../components/ui/Badge";
import { effectiveConfidence } from "../../domain/cascade";
import { pct } from "../../lib/format";

interface AnswerCardProps {
  name: string;
  answer: AnswerPayload;
  question: Question | undefined;
  /** Esta pregunta tiene la menor confianza: es la que fija la ruta. */
  decidesRoute: boolean;
}

/** Una respuesta System One. Lo que muestra depende de su tipo (noul | choice | score). */
export function AnswerCard({ name, answer, question, decidesRoute }: AnswerCardProps) {
  const type = answer.type ?? question?.type;
  const confidence = effectiveConfidence(answer);

  return (
    <article className="rounded-xl border border-line bg-surface-2/40 p-4">
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-mono text-sm font-medium">{name}</h3>
            {type && <Badge mono>{type}</Badge>}
          </div>
          {question && <p className="mt-1 text-xs text-fg-muted">{question.instructions}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-sm tabular" title="Confianza que usa la cascada">
            {pct(confidence)}
          </p>
          {decidesRoute && <p className="text-[10px] text-fg-subtle">define la ruta</p>}
        </div>
      </header>
      <AnswerBody answer={answer} question={question} />
    </article>
  );
}

function Verdict({ label, value }: { label: string; value: string }) {
  return (
    <p className="mb-3 text-xs text-fg-muted">
      {label} <span className="font-mono text-sm font-medium text-fg">{value}</span>
    </p>
  );
}

function AnswerBody({ answer, question }: { answer: AnswerPayload; question: Question | undefined }) {
  if (answer.type === "noul" && typeof answer.noul === "number") {
    const yes = question?.noul_true || "Sí";
    const no = question?.noul_false || "No";
    return (
      <>
        <Verdict label="Respuesta" value={answer.noul >= 0.5 ? yes : no} />
        <ProbabilityBars probabilities={{ [yes]: answer.noul, [no]: 1 - answer.noul }} sort={false} />
        <p className="mt-2 text-[10px] text-fg-subtle">Confianza = |2·P − 1| (noul no trae una propia).</p>
      </>
    );
  }

  if (answer.type === "score" && typeof answer.score === "number") {
    return (
      <>
        <Verdict label="Valor" value={answer.score.toFixed(2)} />
        {answer.probabilities && <ProbabilityBars probabilities={answer.probabilities} sort={false} />}
      </>
    );
  }

  if (answer.type === "choice" && answer.choice) {
    return (
      <>
        <Verdict label="Elegida" value={answer.choice} />
        {answer.probabilities && <ProbabilityBars probabilities={answer.probabilities} descriptions={question?.criteria} highlight={answer.choice} />}
      </>
    );
  }

  // Forma previa a la Fase 2 (registros viejos del historial local).
  return answer.probabilities ? (
    <ProbabilityBars probabilities={answer.probabilities} descriptions={question?.criteria} />
  ) : (
    <p className="text-xs text-fg-subtle">Sin detalle.</p>
  );
}
