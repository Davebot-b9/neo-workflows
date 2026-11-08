import { useCallback, useEffect, useState } from "react";

import { errorMessage } from "../api/gateway";

const cache = new Map<string, unknown>();

interface ResourceState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
}

/**
 * Carga asíncrona con caché por llave (stale-while-revalidate mínimo):
 * al volver a una página se pinta lo último conocido mientras se refresca.
 * `load` debe ser estable mientras `key` no cambie.
 */
export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<ResourceState<T>>(() => ({
    data: cache.get(key) as T | undefined,
    error: null,
    loading: !cache.has(key),
  }));
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ data: (cache.get(key) as T | undefined) ?? s.data, error: null, loading: true }));
    load(controller.signal).then(
      (data) => {
        cache.set(key, data);
        if (!controller.signal.aborted) setState({ data, error: null, loading: false });
      },
      (err: unknown) => {
        if (!controller.signal.aborted) setState((s) => ({ ...s, error: errorMessage(err), loading: false }));
      },
    );
    return () => controller.abort();
    // `load` se asume ligado a `key` a propósito: incluirlo recargaría en cada render.
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
