import { FlaskConical, History, LayoutDashboard, Play, Workflow, type LucideIcon } from "lucide-react";

import type { RoutePath } from "./router";

export interface NavItem {
  path: RoutePath;
  label: string;
  description: string;
  icon: LucideIcon;
  keywords: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    path: "/",
    label: "Centro de control",
    description: "Salud de los servicios, métricas y actividad reciente.",
    icon: LayoutDashboard,
    keywords: "inicio dashboard salud métricas overview",
  },
  {
    path: "/runs",
    label: "Playground",
    description: "Ejecuta un workflow y sigue cada etapa en vivo.",
    icon: Play,
    keywords: "run ejecutar clasificar decidir probar",
  },
  {
    path: "/history",
    label: "Historial",
    description: "Runs de este navegador, con su decisión y tiempos.",
    icon: History,
    keywords: "runs pasados bitácora decisiones",
  },
  {
    path: "/workflows",
    label: "Workflows",
    description: "Catálogo de workflows: preguntas, modelo fijo y umbrales.",
    icon: Workflow,
    keywords: "catálogo yaml preguntas cascada umbrales",
  },
  {
    path: "/finetune",
    label: "Fine-tuning",
    description: "Entrena un adaptador y sigue la curva de pérdida en vivo.",
    icon: FlaskConical,
    keywords: "jobs entrenar lora adaptador loss",
  },
];

export function navItemFor(path: RoutePath): NavItem {
  return NAV_ITEMS.find((item) => item.path === path) ?? NAV_ITEMS[0];
}
