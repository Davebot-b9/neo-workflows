// localStorage puede no existir o lanzar (modo privado, cuota llena).
// La app funciona igual en memoria; persistir es una comodidad, no un requisito.

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin persistencia: seguimos en memoria */
  }
}
