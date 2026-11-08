import { useEffect, useState } from "react";

/** Reloj que solo avanza mientras `active` (cronómetros en vivo sin re-render ocioso). */
export function useNow(active: boolean, intervalMs = 50): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);

  return now;
}
