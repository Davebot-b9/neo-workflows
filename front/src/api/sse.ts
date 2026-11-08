import type { Unsubscribe } from "../lib/createStore";

interface TypedEvent {
  id: number;
  type: string;
  data: unknown;
}

interface SubscribeSSEOptions<E extends TypedEvent> {
  url: string;
  types: readonly E["type"][];
  /** Eventos tras los cuales el stream se da por terminado y se cierra. */
  terminal: readonly E["type"][];
  onEvent: (event: E) => void;
  /** Construye el evento de error del dominio cuando la conexión muere sin evento terminal. */
  connectionLost: (message: string) => E;
}

/**
 * Adapter: EventSource (eventos con nombre, data en string, reconexión
 * implícita) → callback con eventos tipados del dominio.
 *
 * Cerrar al recibir un evento terminal es obligatorio: neo-api cierra el
 * stream al terminar el run y EventSource se reconectaría solo; el Broker
 * reproduce su backlog a quien llega tarde, así que sin este cierre los
 * eventos se repetirían cada ~3 s para siempre.
 */
export function subscribeSSE<E extends TypedEvent>(options: SubscribeSSEOptions<E>): Unsubscribe {
  const source = new EventSource(options.url);
  let finished = false;
  let fallbackId = 0;

  const listeners = options.types.map((type) => {
    const listener = (message: MessageEvent<string>) => {
      if (finished) return;
      let data: unknown;
      try {
        data = JSON.parse(message.data);
      } catch {
        return; // evento malformado: lo ignoramos en lugar de tumbar la UI
      }
      const parsedId = Number(message.lastEventId);
      const id = message.lastEventId !== "" && Number.isFinite(parsedId) ? parsedId : ++fallbackId;
      options.onEvent({ id, type, data } as E);
      if (options.terminal.includes(type)) {
        finished = true;
        source.close();
      }
    };
    source.addEventListener(type, listener);
    return [type, listener] as const;
  });

  // EventSource reintenta solo ante cortes de red; si queda CLOSED es porque
  // el servidor respondió algo que no es un stream (404, 502…): no hay vuelta.
  const onError = () => {
    if (finished || source.readyState !== EventSource.CLOSED) return;
    finished = true;
    options.onEvent(options.connectionLost("Se perdió la conexión con neo-api antes de terminar."));
  };
  source.addEventListener("error", onError);

  return () => {
    finished = true;
    listeners.forEach(([type, listener]) => source.removeEventListener(type, listener));
    source.removeEventListener("error", onError);
    source.close();
  };
}
