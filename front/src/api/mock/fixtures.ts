import type { Workflow } from "../types";

// Workflows sintéticos para el modo demo. El primero replica
// workflows/clasificar-documento.yaml; el segundo es inventado y ejercita los
// tres tipos de pregunta (choice, noul, score). Ningún dato real.

export const DEMO_WORKFLOWS: Workflow[] = [
  {
    id: "clasificar-documento",
    version: 1,
    provider: "local",
    model: "OmniJev/OneJev-0.8B@c02e305",
    search: { top_k: 5 },
    questions: {
      categoria: {
        type: "choice",
        instructions: "¿A qué categoría pertenece el documento?",
        criteria: {
          contrato: "Acuerdos entre partes",
          factura: "Cobros y pagos",
          reporte: "Informes y resultados",
        },
      },
      urgente: {
        type: "noul",
        instructions: "¿El documento requiere atención inmediata?",
      },
    },
    cascade: { auto: 0.9, llm: 0.6 },
  },
  {
    id: "priorizar-ticket",
    version: 2,
    provider: "local",
    model: "OmniJev/OneJev-0.8B@c02e305",
    search: { top_k: 8 },
    questions: {
      area: {
        type: "choice",
        instructions: "¿Qué área debe atender el ticket?",
        criteria: {
          cobros: "Pagos, reembolsos y facturas duplicadas",
          acceso: "Contraseñas, cuentas y permisos",
          producto: "Errores, fallas o dudas de uso",
        },
      },
      escalar: {
        type: "noul",
        instructions: "¿Debe escalarse a una persona de inmediato?",
        noul_true: "Escalar",
        noul_false: "Puede esperar",
      },
      severidad: {
        type: "score",
        instructions: "¿Qué tan severo es el impacto para el cliente?",
        score_levels: ["leve", "moderada", "alta", "crítica"],
      },
    },
    cascade: { auto: 0.85, llm: 0.55 },
  },
];

export const DEMO_DEPS = ["postgres", "neo-vector", "neo-model"] as const;
