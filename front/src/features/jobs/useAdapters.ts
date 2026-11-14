import { useCallback } from "react";

import type { Adapter } from "../../api/types";
import { useGateway } from "../../app/gateway/gatewayContext";
import { useResource } from "../../hooks/useResource";

export function useAdapters() {
  const { gateway } = useGateway();
  const load = useCallback((signal: AbortSignal) => gateway.listAdapters(signal), [gateway]);
  const resource = useResource<Adapter[]>(`adapters:${gateway.mode}`, load);
  return { ...resource, adapters: resource.data ?? [] };
}
