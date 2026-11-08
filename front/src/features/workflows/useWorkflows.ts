import { useCallback } from "react";

import type { Workflow } from "../../api/types";
import { useGateway } from "../../app/gateway/gatewayContext";
import { useResource } from "../../hooks/useResource";

export function useWorkflows() {
  const { gateway } = useGateway();
  const load = useCallback((signal: AbortSignal) => gateway.listWorkflows(signal), [gateway]);
  const resource = useResource<Workflow[]>(`workflows:${gateway.mode}`, load);
  return { ...resource, workflows: resource.data ?? [] };
}
