import { useMemo, useSyncExternalStore } from "react";

// Router por hash: 5 pantallas fijas no justifican una dependencia.
// Si aparecen rutas anidadas o loaders, migrar a react-router.

export const ROUTE_PATHS = ["/", "/runs", "/history", "/workflows", "/finetune"] as const;
export type RoutePath = (typeof ROUTE_PATHS)[number];

export interface Route {
  path: RoutePath;
  params: URLSearchParams;
}

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

const getHash = () => window.location.hash;

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  const known = (ROUTE_PATHS as readonly string[]).includes(path);
  return { path: known ? (path as RoutePath) : "/", params: new URLSearchParams(query) };
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, () => "");
  return useMemo(() => parseHash(hash), [hash]);
}

export function href(path: RoutePath, params?: Record<string, string>): string {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return `#${path}${query}`;
}

export function navigate(path: RoutePath, params?: Record<string, string>): void {
  window.location.hash = href(path, params);
}
