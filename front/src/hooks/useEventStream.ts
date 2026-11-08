import { useEffect, useRef } from "react";

import type { Unsubscribe } from "../lib/createStore";

export type Subscribe<E> = (onEvent: (event: E) => void) => Unsubscribe;

/**
 * Conecta un stream de eventos (de cualquier NeoGateway) mientras haya
 * `subscribe`. `subscribe` debe ser estable (useMemo/useCallback): cambiarlo
 * reconecta. `onEvent` puede cambiar libremente, se lee por ref.
 */
export function useEventStream<E>(subscribe: Subscribe<E> | null, onEvent: (event: E) => void): void {
  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  });

  useEffect(() => {
    if (!subscribe) return;
    return subscribe((event) => handlerRef.current(event));
  }, [subscribe]);
}
