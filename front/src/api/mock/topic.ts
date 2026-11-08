import type { Unsubscribe } from "../../lib/createStore";

/**
 * Observer con backlog: espejo en el navegador de internal/events/broker.go.
 * Quien se suscribe tarde (incluso después de close) recibe el historial
 * completo, igual que con neo-api. Así la UI se prueba contra el mismo
 * comportamiento que tendrá con el backend real.
 */
export class Topic<E> {
  private readonly backlog: E[] = [];
  private readonly listeners = new Set<(event: E) => void>();
  private closed = false;

  publish(event: E): void {
    if (this.closed) return;
    this.backlog.push(event);
    this.listeners.forEach((listener) => listener(event));
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }

  subscribe(listener: (event: E) => void): Unsubscribe {
    let active = true;
    // Asíncrono como la red: el suscriptor nunca recibe eventos dentro de su propia llamada.
    queueMicrotask(() => {
      if (!active) return;
      this.backlog.forEach(listener);
      if (!this.closed) this.listeners.add(listener);
    });
    return () => {
      active = false;
      this.listeners.delete(listener);
    };
  }
}
