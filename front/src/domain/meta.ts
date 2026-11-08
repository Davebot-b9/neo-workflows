import { BrainCircuit, CircleCheck, GitFork, Search, Sparkles, UserRound, type LucideIcon } from "lucide-react";

import type { DecisionRoute } from "../api/types";

export type Tone = "neutral" | "accent" | "good" | "warn" | "serious" | "critical";

export interface RouteMeta {
  label: string;
  short: string;
  description: string;
  tone: Tone;
  icon: LucideIcon;
}

// Las rutas son estados: usan la paleta de estado (con ícono + texto, nunca solo color).
export const ROUTE_META: Record<DecisionRoute, RouteMeta> = {
  auto: {
    label: "Automático",
    short: "Auto",
    description: "Confianza suficiente: se decide sin escalar.",
    tone: "good",
    icon: CircleCheck,
  },
  llm: {
    label: "Escalar a LLM",
    short: "LLM",
    description: "Confianza media: se consulta a un LLM antes de decidir.",
    tone: "warn",
    icon: Sparkles,
  },
  review: {
    label: "Revisión humana",
    short: "Revisión",
    description: "Confianza baja: una persona revisa el caso.",
    tone: "serious",
    icon: UserRound,
  },
};

export const ROUTE_ORDER: readonly DecisionRoute[] = ["auto", "llm", "review"];

export interface StageMeta {
  id: string;
  label: string;
  service: string;
  tech: string;
  description: string;
  icon: LucideIcon;
}

/** Etapas que publica runs/service.go, en orden. */
export const PIPELINE_STAGES: readonly StageMeta[] = [
  {
    id: "buscar-precedentes",
    label: "Buscar precedentes",
    service: "neo-vector",
    tech: "Rust · gRPC",
    description: "Embeddings y búsqueda top-k de casos parecidos.",
    icon: Search,
  },
  {
    id: "decidir",
    label: "Decidir",
    service: "neo-model / Jev",
    tech: "Python · gRPC",
    description: "Responde cada pregunta del workflow con probabilidades.",
    icon: BrainCircuit,
  },
  {
    id: "cascada",
    label: "Cascada",
    service: "neo-api",
    tech: "Go",
    description: "Aplica los umbrales y elige la ruta de la decisión.",
    icon: GitFork,
  },
];

export function stageMeta(name: string): StageMeta {
  return (
    PIPELINE_STAGES.find((s) => s.id === name) ?? {
      id: name,
      label: name,
      service: "neo-api",
      tech: "—",
      description: "Etapa no catalogada en el front.",
      icon: GitFork,
    }
  );
}
