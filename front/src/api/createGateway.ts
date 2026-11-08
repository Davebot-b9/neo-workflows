import { createHttpGateway } from "./client";
import type { GatewayMode, NeoGateway } from "./gateway";
import { createMockGateway } from "./mock/mockGateway";
import { isHealth } from "./types";

export type ModePreference = "auto" | GatewayMode;

/** Factory: la única línea del front que sabe qué estrategias existen. */
export function createGateway(mode: GatewayMode): NeoGateway {
  return mode === "live" ? createHttpGateway() : createMockGateway();
}

/**
 * Modo "auto": si /healthz responde con la forma de neo-api (aunque sea 503
 * por una dependencia caída) estamos en vivo; si no hay nadie, demo.
 */
export async function detectMode(timeoutMs = 1500): Promise<GatewayMode> {
  try {
    const res = await fetch("/healthz", { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    const body: unknown = await res.json().catch(() => null);
    return isHealth(body) ? "live" : "demo";
  } catch {
    return "demo";
  }
}
