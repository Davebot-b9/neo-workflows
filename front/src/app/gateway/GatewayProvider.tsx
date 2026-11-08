import { useEffect, useMemo, useState, type ReactNode } from "react";

import { createGateway, detectMode, type ModePreference } from "../../api/createGateway";
import type { GatewayMode } from "../../api/gateway";
import { readJSON, writeJSON } from "../../lib/storage";
import { GatewayContext, type GatewayContextValue } from "./gatewayContext";
import { Splash } from "./Splash";

const PREF_KEY = "neo.mode";

function readPreference(): ModePreference {
  const value = readJSON<string>(PREF_KEY, "auto");
  return value === "live" || value === "demo" ? value : "auto";
}

/**
 * Decide qué estrategia de NeoGateway usa toda la app.
 * - "live"/"demo": elección manual, persistida.
 * - "auto": sondea /healthz al arrancar; si neo-api contesta, en vivo.
 */
export function GatewayProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ModePreference>(readPreference);
  const [detected, setDetected] = useState<GatewayMode | null>(null);

  useEffect(() => {
    if (preference !== "auto") return;
    let cancelled = false;
    void detectMode().then((mode) => {
      if (!cancelled) setDetected(mode);
    });
    return () => {
      cancelled = true;
    };
  }, [preference]);

  const mode: GatewayMode | null = preference === "auto" ? detected : preference;

  const value = useMemo<GatewayContextValue | null>(() => {
    if (!mode) return null;
    return {
      gateway: createGateway(mode),
      mode,
      preference,
      setPreference: (next) => {
        writeJSON(PREF_KEY, next);
        if (next === "auto") setDetected(null);
        setPreferenceState(next);
      },
    };
  }, [mode, preference]);

  if (!value) return <Splash />;
  return <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>;
}
