# RunPage (Playground)

Archivos: `src/features/runs/` — `RunPage.tsx` (orquesta), `RunForm.tsx`
(compositor controlado), `Timeline.tsx` (pipeline), `DecisionPanel.tsx`,
`EventLog.tsx`, `useRun.ts`, `runReducer.ts`, `runSession.ts`.

## Flujo de un run

1. `RunForm` llama `onSubmit` (botón o Ctrl/⌘+Enter). No tiene estado propio.
2. `useRun.start(workflowId, text)`:
   - `dispatch(start)` → fase `starting`, etapas en `pending`.
   - `gateway.startRun()` → `POST /api/runs`.
   - OK: guarda el run en `activeRunStore` y `dispatch(started)` → fase `streaming`.
   - Error HTTP: `dispatch(failed)` → fase `error` (sin `runId`, no va al historial).
3. Con `runId`, `useEventStream` se suscribe a `gateway.subscribeRun()`.
4. Cada evento pasa por `runReducer`:
   - `run.stage started` → etapa `running` (el cronómetro corre con `useNow`).
   - `run.stage done/error` → etapa con el `ms` que reporta neo-api.
   - `run.decision` → `DecisionPanel` muestra la ruta, la confianza en el `ThresholdBar` y las probabilidades por pregunta.
   - `run.done` → fase `done`. `run.error` → fase `error` y la etapa que corría se marca como fallida.
5. Al llegar a `done`/`error`, el efecto de `useRun` llama `recordRun()` (idempotente por `runId`) y limpia `activeRunStore`.

## Navegar a mitad de un run

`activeRunStore` vive fuera de React. Si el usuario sale del Playground y
vuelve, `useRun` arranca con `resume` y se re-suscribe. El backlog del Broker
(o del `Topic` demo) reproduce todo y el reducer reconstruye el estado; los
eventos repetidos se descartan por `id`.

## Etapas

`PIPELINE_STAGES` (`src/domain/meta.ts`) define las tres etapas conocidas. Si
neo-api publica una etapa nueva, el reducer la agrega al final en lugar de
perderla.
