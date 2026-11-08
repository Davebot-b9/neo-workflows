import { useSyncExternalStore } from "react";

export type Unsubscribe = () => void;

/**
 * Observer mínimo: un valor + suscriptores. Se usa para estado de sesión que
 * debe sobrevivir a la navegación entre páginas (tema, historial, run activo)
 * sin traer una librería de estado.
 */
export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): Unsubscribe;
}

export function createStore<T>(initial: T, onChange?: (value: T) => void): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      onChange?.(value);
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
