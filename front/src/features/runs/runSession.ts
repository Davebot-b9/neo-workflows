import type { GatewayMode } from "../../api/gateway";
import { createStore } from "../../lib/createStore";

/**
 * Run en curso de esta pestaña. Vive fuera de React para que, si el usuario
 * navega a otra página y vuelve, useRun se re-suscriba y el backlog del
 * broker (o del Topic demo) reconstruya el estado completo.
 */
export interface ActiveRun {
  runId: string;
  workflowId: string;
  text: string;
  startedAt: number;
  mode: GatewayMode;
}

export const activeRunStore = createStore<ActiveRun | null>(null);
