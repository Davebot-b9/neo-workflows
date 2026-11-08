import { createContext, useContext } from "react";

import type { ModePreference } from "../../api/createGateway";
import type { GatewayMode, NeoGateway } from "../../api/gateway";

export interface GatewayContextValue {
  gateway: NeoGateway;
  mode: GatewayMode;
  preference: ModePreference;
  setPreference: (preference: ModePreference) => void;
}

export const GatewayContext = createContext<GatewayContextValue | null>(null);

export function useGateway(): GatewayContextValue {
  const ctx = useContext(GatewayContext);
  if (!ctx) throw new Error("useGateway debe usarse dentro de <GatewayProvider>");
  return ctx;
}
