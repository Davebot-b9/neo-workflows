import { useEffect } from "react";

// Custom hook: un solo lugar para EventSource, reconexión y limpieza.
// `types` y `onEvent` deben ser estables (constante o useCallback) para no reconectar.
export function useEventStream<T>(
  url: string | null,
  types: readonly string[],
  onEvent: (type: string, data: T) => void,
) {
  useEffect(() => {
    if (!url) return;
    const source = new EventSource(url); // reconecta y envía Last-Event-ID
    const handlers = types.map((type) => {
      const handler = (msg: MessageEvent<string>) => onEvent(type, JSON.parse(msg.data) as T);
      source.addEventListener(type, handler);
      return [type, handler] as const;
    });
    return () => {
      handlers.forEach(([type, handler]) => source.removeEventListener(type, handler));
      source.close();
    };
  }, [url, types, onEvent]);
}
