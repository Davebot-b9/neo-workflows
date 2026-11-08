import type { AnswerPayload, DecisionRoute, Workflow } from "../api/types";

// Espejo de lectura de back/internal/cascade, overallConfidence (runs/service.go)
// y Answer.EffectiveConfidence (provider/provider.go). La decisión real la toma
// Go; esto sirve para que el modo demo produzca rutas coherentes y para
// mostrar en la UI qué confianza usó la cascada en cada pregunta.

export function routeFor(confidence: number, cascade: Workflow["cascade"]): DecisionRoute {
  if (confidence >= cascade.auto) return "auto";
  if (confidence >= cascade.llm) return "llm";
  return "review";
}

/** noul no trae confidence propio: la cascada usa la distancia a 0.5 reescalada, |2·noul − 1|. */
export function effectiveConfidence(answer: AnswerPayload): number {
  if (answer.type === "noul" && typeof answer.noul === "number") return Math.abs(2 * answer.noul - 1);
  return answer.confidence ?? 0;
}

/** La cascada es tan segura como su pregunta más dudosa. */
export function overallConfidence(answers: Record<string, AnswerPayload>): number {
  const values = Object.values(answers).map(effectiveConfidence);
  return values.length ? Math.min(...values) : 0;
}
