# FineTunePage

Archivos: `src/features/jobs/` — `FineTunePage.tsx`, `HyperparamsEditor.tsx`,
`useFineTune.ts`, `jobReducer.ts`.

## Flujo

1. Validación local antes de enviar: `base_model` obligatorio y **nunca
   `latest`** (regla 6), `dataset_uri` obligatorio. Los errores se muestran
   después del primer intento de envío.
2. Los hiperparámetros se envían como `map<string,string>` (así está en el
   contrato); las filas sin llave se descartan.
3. `useFineTune.start()` → `POST /api/jobs/finetune` → guarda el job en
   `activeJobStore` → suscripción a `job.*`.
4. `jobReducer`:
   - `job.progress` agrega `(step, loss)` a la curva y actualiza `max_steps` y `eta`.
   - `job.done` guarda `adapter_uri` (se muestra con botón de copiar).
   - `job.error` muestra el error.
5. Igual que en los runs: si el usuario navega y vuelve, el job se retoma desde
   el backlog. Ojo: en vivo el Broker guarda solo 256 eventos por topic, así que
   un job muy largo pierde el inicio de la curva al reconectar.

## Curva de pérdida

`LineChart` (`src/components/charts`) usa un dominio fijo `x = [1, max_steps]`
para que la curva crezca en su lugar en vez de reescalarse con cada paso.
