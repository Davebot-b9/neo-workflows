export interface StageEvent {
  name: string;
  status: "started" | "done" | "error";
  ms: number;
}

export interface AnswerPayload {
  probabilities: Record<string, number>;
  confidence: number;
}

export interface DecisionEvent {
  answers: Record<string, AnswerPayload>;
  confidence: number;
  route: "auto" | "llm" | "review";
}

export interface ErrorEvent {
  error: string;
}

export type RunEventType = "run.stage" | "run.decision" | "run.done" | "run.error";

export const RUN_EVENT_TYPES: readonly RunEventType[] = [
  "run.stage",
  "run.decision",
  "run.done",
  "run.error",
];
