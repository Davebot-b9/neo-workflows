# NeoGateway: fuente de datos en vivo o demo

## Qué resuelve

El front se construyó antes de que neo-api, neo-model y neo-vector estuvieran
completos. `NeoGateway` (`src/api/gateway.ts`) es la única puerta de la UI
hacia el backend y tiene dos estrategias con el mismo contrato:

| Estrategia | Archivo | Qué hace |
| --- | --- | --- |
| `live` | `src/api/client.ts` | `fetch` a las rutas del brief + `EventSource` vía `src/api/sse.ts` |
| `demo` | `src/api/mock/mockGateway.ts` | Simula runs y jobs en el navegador, mismos eventos, mismo orden, mismo backlog |

`createGateway(mode)` (`src/api/createGateway.ts`) es el único lugar que sabe
que existen las dos.

## Flujo de selección (GatewayProvider)

1. Lee la preferencia en `localStorage["neo.mode"]`: `auto` (por defecto), `live` o `demo`.
2. Si es `auto`, `detectMode()` sondea `GET /healthz` con un timeout de 1.5 s:
   - responde JSON con forma `{ok, deps}` (aunque sea 503) → `live`
   - error de red, 502 del proxy de Vite o cuerpo inválido → `demo`
3. Mientras detecta, se muestra `Splash`.
4. Cambiar de modo (sidebar o ⌘K) vuelve a montar todas las páginas (`RemountOnModeChange` en `App.tsx`) contra el nuevo gateway.

## Adaptador SSE (`src/api/sse.ts`)

- Convierte cada `MessageEvent` con nombre en `{ id, type, data }` tipado.
- **Cierra el stream al recibir un evento terminal** (`run.done`/`run.error`, `job.done`/`job.error`). Sin esto, `EventSource` se reconecta cuando neo-api cierra el stream, el Broker reproduce el backlog y los eventos se repiten indefinidamente.
- Si la conexión queda en `CLOSED` sin evento terminal (404, 502…), emite un evento de error del dominio.

## Garantías que los reducers asumen

- Cada evento trae `id` creciente (el `id:` del SSE, o un contador en demo).
- `runReducer` y `jobReducer` ignoran `id <= lastEventId`: las reconexiones, el backlog repetido y el doble montaje de StrictMode no duplican nada.

## Cuando llegue el backend real

No hay que tocar las páginas. Si cambia un payload, se cambia `src/api/types.ts`
(espejo del contrato) y lo que el compilador marque. El modo demo se puede
quedar como doble de pruebas (`createMockGateway({ speed: 0 })`).
