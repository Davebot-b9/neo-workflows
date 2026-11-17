# NEO Workflows — CLAUDE.md

Proyecto personal y local de Oscar D. Morelos R. (Dave). El brief completo
vive fuera del repo (`NEO Workflows · Brief del proyecto personal.md`); este
archivo copia lo que un agente necesita tener siempre presente: Reglas y
Contratos, más las notas de cómo se armó realmente este entorno.

## Mapeo de nombres

El brief llama a los servicios `web`, `api`/`neo-api`, `neo-vector`,
`neo-model`. En este repo los directorios ya existían como `back/` y
`front/` (creados por Oscar antes de empezar), así que se mantuvieron:

| Servicio del brief | Directorio | Lenguaje |
| --- | --- | --- |
| `web` | `front/` | TypeScript 7 + React + Vite |
| `neo-api` | `back/` | Go (módulo `neo-api`) |
| `neo-vector` | `vector/` | Rust |
| `neo-model` | `model/` | Python |

## Reglas para el agente

1. **Cero datos de Ferrer & Asociados.** Ni auditorías, ni documentos internos, ni información de clientes, en el repo, en prompts o en proveedores.
2. **Nada destructivo sin autorización explícita.** Borrar archivos o tablas, reescribir historia de git o hacer force push requiere un sí de Oscar.
3. **Secretos solo en `.env`**, que está en `.gitignore`. `.env.example` lleva valores ficticios.
4. **Fronteras de responsabilidad.** La lógica de negocio vive en Go; Python solo sirve y entrena el modelo; Rust solo hace vectores.
5. **Contrato primero.** Un cambio entre servicios empieza en el `.proto` y se regenera (ver Generación de código abajo).
6. **Modelos con versión fija** en `workflows/*.yaml`. Nunca `latest`.
7. **Pruebas en verde para cerrar una tarea**, incluido `go test -race`.
8. **Patrones con criterio.** Aplica solo los de la sección Patrones del brief; uno nuevo se propone con su veredicto antes de implementarlo.
9. **Reportes breves.** Qué hiciste, qué mediste, qué falta y qué decisión necesitas.
10. **`decisions` es append-only de verdad.** La tabla tiene triggers que bloquean UPDATE/DELETE (ver `back/internal/ledger/migrations/0001_init.sql`); no los quites.

## Contratos

- Front → `neo-api`: HTTP (comandos) + SSE (eventos), ver tabla de rutas en el brief (`POST /api/runs`, `GET /api/runs/{id}/events`, `POST /api/jobs/finetune`, `GET /api/jobs/{id}/events`, `GET /api/workflows`, `GET /healthz`). Agregada después del brief: `GET /api/runs?limit=N` (default 50, máx 500), solo lectura de la bitácora `decisions` (`ledger.Reader`).
- `neo-api` → `neo-vector` / `neo-model`: gRPC puro (no Connect), definido en `proto/neo/v1/*.proto`. Va en texto plano (h2c): `back/internal/grpcconn` arma el cliente HTTP/2 sin TLS que esto necesita.
- La forma de una decisión imita la API System One (`DecideRequest`/`DecideResponse` en `proto/neo/v1/model.proto`) para que Jev y el modelo local sean intercambiables sin tocar la lógica.
- **`Answer` es un oneof** (`noul` | `choice` | `score`), no un tipo genérico con `probabilities`+`confidence` para los tres. Verificado contra el código fuente real de `qev` (la librería de OneJev, `qev/schema.py` y `qev/answers.py` en github.com/OmniJev/OneJev — dice seguir el OpenAPI público de TypeSafe y está comprobado contra respuestas reales de Jev, MAE 0.013 en choice y 0.005 en score):
  - `noul`: solo `{noul: float}` — sin `probabilities` ni `confidence` propios. La cascada usa `EffectiveConfidence()` (`back/internal/provider/provider.go`), que deriva `abs(2*noul-1)`.
  - `choice`: `{choice: string, probabilities: {...}, confidence: float}`.
  - `score`: `{score: float, legend: {...}, probabilities: {...}, confidence: float}`. `Question.score_levels` es una **lista ordenada** (el índice es el valor), no un mapa como `choice_criteria`.
  - `Usage` es `{input_tokens, output_tokens}`, no `{prompt_tokens, completion_tokens, latency_ms}` — la latencia la mide Go por su cuenta (`stageDecide` en `runs/service.go`), no viaja en el contrato.
  - Este era el TODO bloqueante de la Fase 0; se corrigió en la Fase 2 antes de conectar un modelo real, con `proto/neo/v1/model.proto`, el código Go (`provider`, `provider/jev`, `provider/local`, `runs`) y los stubs Python regenerados en el mismo cambio.

## Versiones fijadas (verificadas al crear el repo, nov 2026)

Verificadas contra fuentes reales (go.dev/dl, endoflife.date, crates.io, PyPI, npm, Docker Hub), no adivinadas. Si pasa tiempo, vuelve a verificar antes de confiar en estos números.

| Herramienta | Versión | Dónde está fijada |
| --- | --- | --- |
| Go | 1.27.3 | `back/go.mod` |
| Rust | 1.99.1 | `vector/rust-toolchain.toml` |
| Node | 24.22.2 (LTS) — la máquina tenía 24.11.0 instalado | `front/package.json#engines` |
| TypeScript | 7.0.2 | `front/package.json` |
| PostgreSQL | 18.6 | `compose.yaml` |
| buf | 1.75.0 | usado puntualmente vía `go install`, ver abajo |
| Python | 3.12.9 (ya instalado en la máquina) | `model/.python-version` |

Dependencias de cada servicio: ver `back/go.mod`, `vector/Cargo.toml`, `model/pyproject.toml`, `front/package.json`. De la Fase 1: `fastembed` 7.6.1, `usearch` 2.26.6, `rayon` 1.12.0 (crates.io, verificado). De la Fase 2: `torch` 2.15.0, `transformers` 5.22.2, `accelerate` 1.15.0 (PyPI, verificado); `qev` fijado al commit `31678bc` de github.com/OmniJev/OneJev (no hay versión en PyPI con ese nombre que sea la misma librería). De la Fase 3: `peft` 0.21.2 (PyPI, verificado).

## Generación de código desde los .proto

- **Go**: NO se genera en cada build. `back/internal/genproto/` tiene código generado y comprometido al repo (Go no tiene un equivalente limpio a `build.rs`). Si cambias un `.proto`, regenera así (no hay Go instalado en esta máquina, se usa un contenedor desechable):
  ```bash
  docker run --rm -v "$PWD:/workspace" -v neo-go-mod-cache:/root/go/pkg/mod -w /workspace golang:1.27.3-bookworm bash -c "
    go install github.com/bufbuild/buf/cmd/buf@v1.75.0 &&
    go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.12 &&
    go install connectrpc.com/connect/cmd/protoc-gen-connect-go@v1.21.1 &&
    export PATH=\$PATH:\$(go env GOPATH)/bin &&
    buf generate"
  ```
- **Rust**: se genera solo, en cada `cargo build`, vía `vector/build.rs` (usa `tonic-prost-build`; `protobuf-src` compila su propio `protoc`, pero necesita `cmake` disponible — el `Dockerfile` ya lo instala).
- **Python**: comprometido en `model/neo_model/genproto/`. Para regenerar (si cambia `model.proto`):
  ```bash
  python -m grpc_tools.protoc -I proto --python_out=model/neo_model/genproto --grpc_python_out=model/neo_model/genproto proto/neo/v1/model.proto
  ```
- **TS**: el front no habla gRPC directo (solo HTTP/JSON + SSE con `neo-api`), así que no necesita nada generado del `.proto`.

## Cómo se verificó cada pieza (sin Go/Rust instalados en el host)

Esta máquina (Windows) no tiene Go, Rust, ni buf instalados — solo Node 24, Python 3.12 y Docker Desktop. Todo lo de abajo se corrió de verdad, no se asumió:

- `neo-model` (Python): servidor levantado localmente, `Health` y `Decide` probados con un cliente gRPC real.
- `neo-api` (Go): `go mod tidy && go build ./... && go vet ./... && go test -race ./...` corridos dentro de `golang:1.27.3-bookworm` (ver comando de generación arriba como plantilla; cambia `buf generate` por `go build ./...` etc.). Encontró y corrigió un bug real de doble `close()` en `internal/events/broker.go`.
- `neo-vector` (Rust): `cargo build --release && cargo test` corridos dentro de `rust:1.99.1-trixie` (no bookworm, ver Fase 1) con `cmake` instalado.
- `front` (TS): `npm install`, `npx tsc --noEmit` corridos localmente con Node. **Limitación conocida**: `npx eslint .` no corre todavía — `typescript-eslint@8.72.1` rechaza explícitamente TypeScript 7.0 (ver [issue #10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940), sin resolver aguas arriba). Se intentó el alias de npm a `@typescript/typescript6` que sugiere el brief, pero el `overrides` de npm no logra evitar el hoisting al único `typescript@7.0.2` del árbol (queda "invalid"). `tsc --noEmit` sí corre limpio con TS7 real.

## Fase 0: verificada de punta a punta

`docker compose up` levanta los cuatro servicios (sanos) y un run real cruza
TS → Go → Rust y Python y vuelve al navegador por SSE — probado con
`front/` corriendo de verdad contra el backend en Docker, no solo con curl.
En el camino salieron y se corrigieron tres bugs reales (no hipotéticos):

1. **Broker SSE con doble `close()`** de canal (`internal/events/broker.go`): `Close(topic)` y la función `unsubscribe` de `Subscribe` podían cerrar el mismo canal dos veces. Lo encontró `go test -race`.
2. **Carrera entre un run simulado (rápido) y el cliente SSE suscribiéndose**: sin latencia artificial, un run podía terminar y cerrar su topic antes de que el `GET /api/runs/{id}/events` llegara a suscribirse, y el navegador no veía nada. El Broker ahora guarda un backlog acotado por topic (256 eventos) y lo reproduce a quien se suscribe tarde, incluso después de `Close()`.
3. **Volumen de PostgreSQL mal montado**: Postgres 18+ cambió la convención de `/var/lib/postgresql/data` a `/var/lib/postgresql` (ver `compose.yaml`); con el montaje viejo el contenedor no arrancaba.

## Fase 1: embeddings y búsqueda real en neo-vector

`neo-vector` ya no simula: `Upsert` embebe los documentos que no traen vector
(fastembed-rs, modelo `intfloat/multilingual-e5-small`, 384 dim, CPU) y
`Search` embebe `query_text` si no viene `query_vector`. Decisiones tomadas
con Oscar (ver Preguntas abiertas): **multilingual-e5-small** para embeddings,
**usearch** (HNSW) como índice de producción, comparado contra un índice
propio de fuerza bruta en paralelo con `rayon` (`vector/src/index/`), que
además sirve de referencia exacta para medir recall. GPU confirmada para
fases futuras: **RTX 4060** (no se usó aquí — fastembed en CPU fue
suficiente, ver brief: "Fases 0-2 corren en CPU").

**Medido de verdad** (no simulado), a 2000 documentos sintéticos (`data/generate_documents.py`, categorías contrato/factura/reporte) — la corrida completa al millón que pide el brief quedó pendiente, ver abajo:
- **recall@10 = 0.993** (100 consultas de muestra, `bench/measure_recall.py` comparando usearch contra el índice de fuerza bruta).
- **p95 de búsqueda secuencial: 32.3 ms** (incluye red + embedding de la query).
- **p95 bajo carga concurrente (ghz, 10 conexiones): 209.5 ms** (`bench/loadtest.sh`) — más alto que el secuencial porque `Embedder` protege el modelo de fastembed con un `Mutex` (`vector/src/embed/mod.rs`): todas las llamadas de embedding se serializan, es el cuello de botella real bajo concurrencia. **Resuelto después de la Fase 4** con un pool de embedders (ver sección "Después de la Fase 4" abajo).

**La corrida al millón ya se hizo** (ver "Después de la Fase 4" abajo y `bench/fase5_concurrencia.md`). En esta máquina no caben dos instancias con 1M a la vez, así que se usó `bench/record_topk.py` (graba y compara) en lugar de `measure_recall.py`.

Verificado con Docker real, no solo "debería compilar":
- `cargo build --release` y `cargo test` (4/4) corridos en `rust:1.99.1-trixie`. **Bookworm no sirve para este crate**: el runtime de ONNX que trae `ort` (dependencia de fastembed) necesita símbolos de glibc 2.38+ (`__isoc23_strtol` y afines) que Debian bookworm (glibc 2.36) no tiene — error de linking real, no hipotético. `vector/Dockerfile` usa `rust:1.99.1-trixie` / `debian:trixie-slim` para build y runtime (se abandonó `distroless` ahí: fastembed/onnxruntime necesitan más libs del sistema).
- `docker compose build/up` real, `Upsert` + `Search` probados con texto real en español vía gRPC: la consulta "factura atrasada que hay que cobrar" encontró correctamente las dos facturas vencidas por encima de un contrato y un reporte — similitud semántica real, no coincidencia de palabras.
- El modelo (~470MB) se cachea en el volumen `neo-vector-model-cache` (`/data/.fastembed_cache` dentro del contenedor); sin ese volumen se vuelve a bajar en cada `recreate`.

## Fase 2: decisiones reales con OneJev-0.8B

`neo-model` ya no simula: sirve inferencia real con **OmniJev/OneJev-0.8B**
(Apache 2.0, Qwen3.5-0.8B de base, ~2.2GB en bf16) vía la librería `qev`
(github.com/OmniJev/OneJev, instalada por git+commit — **no confundir con el
paquete `qev` de PyPI, que es un proyecto no relacionado de otro autor**).
Decisiones tomadas con Oscar: GPU = **RTX 4060, 8GB** (confirmada con
`docker run --gpus all ... nvidia-smi`, funciona); sin acceso a Jev por
ahora (el proveedor sigue implementado pero inactivo).

**El contrato de `Answer` estaba mal desde la Fase 0** — ver la nota en
Contratos arriba. Se corrigió antes de conectar el modelo real.

**Dos hallazgos reales de la librería `qev`, no bugs nuestros, documentados
para quien la toque después:**
- `DecisionEngine.decide()` no acepta un `revision` de Hugging Face fijo (su
  `__init__` no tiene ese parámetro): siempre carga la rama `main` del
  repo, no un commit pinneado. `workflows/clasificar-documento.yaml` fija
  `model: "OmniJev/OneJev-0.8B@c02e305"` como string informativo para la
  bitácora, pero eso no controla qué pesos se cargan de verdad.
- `DecisionEngine.decide()` deja `model=""` en la respuesta siempre
  (`engine.py` línea ~506: `SystemOneResponse(model="", ...)` literal, no es
  cosa nuestra). `model/neo_model/decide.py` hace eco de `request.model` en
  vez de usar `response.model`.

**Medido de verdad** con el modelo cargado en GPU real (no CPU, no simulado):
- Carga del modelo: 120s la primera vez (descarga + carga), 18.7s con el
  volumen `neo-model-cache` ya tibio.
- Latencia de `Decide`: ~430ms en frío, ~120-150ms en caliente, para 1-2
  preguntas.
- **Concordancia: 1.0000 (300/300)** y **ECE: 0.0264** (`bench/measure_calibration.py`,
  10 bins, pregunta `categoria` contra los documentos sintéticos etiquetados
  de `data/generate_documents.py`). **Con una salvedad honesta**: las
  plantillas sintéticas usan vocabulario muy distintivo por categoría
  (factura siempre dice "factura"/"vencida"/"cobra", etc.), así que es una
  tarea fácil — 100% de concordancia aquí no necesariamente generaliza a
  documentos reales más ambiguos. Los 300 casos cayeron todos en el bin de
  confianza 0.9-1.0, así que el ECE medido casi no ejercita calibración en
  confianzas bajas o medias.
- Verificado de punta a punta vía `neo-api`: un run real (`buscar-precedentes`
  54ms, `decidir` 535ms) calculó `confidence: 0.567912` para una
  pregunta `noul` con `noul: 0.216` — coincide exactamente con la fórmula
  `EffectiveConfidence` (`abs(2*0.216-1) = 0.568`), y la cascada mandó el run
  a `review` como correspondía por debajo del umbral `llm: 0.60`.

**Imagen de `neo-model`**: pasa de `python:3.12.9-slim-bookworm` a
`pytorch/pytorch:2.15.0-cuda13.2-cudnn9-runtime` (torch/CUDA ya instalados
y enlazados; reinstalarlos desde PyPI daría ruedas CPU-only y rompería la
GPU en silencio). Necesita `--break-system-packages` en pip (PEP 668) y
`git` instalado (para clonar `qev`, que no está en PyPI).

**Pendiente, explícito**:
- Optimizaciones opcionales de `qev` no instaladas (`causal_conv1d`,
  `flash-linear-attention`): el log avisa que usa el fallback de PyTorch,
  más lento pero correcto. No bloquea la Fase 2.
- Repetir concordancia/ECE con documentos menos distinguibles léxicamente,
  para una medida más realista de calibración.
- Medir p95 de `Decide` bajo carga concurrente (como se hizo para
  `neo-vector` en la Fase 1) — no se hizo aquí.

## Fase 3: fine-tuning LoRA real

`neo-model` entrena LoRA de verdad sobre `OmniJev/OneJev-0.8B`, no simulado:
`model/neo_model/train/lora.py` usa `peft` (r=8, `target_modules="all-linear"`)
con el mismo renderizado de prompt que `qev` (`qev.prompt.render_question`/
`build_messages`) para que el adaptador entrenado sea compatible con
`DecisionEngine` en inferencia — la señal de entrenamiento es "predecir la
letra correcta como siguiente token", justo lo que `DecisionEngine` lee de
los logits de los slots (ver `qev/prompt.py`, `SLOT_LABELS`). No hizo falta
el pipeline `train.sft` del propio `qev` (full fine-tune multi-GPU): es
next-token prediction estándar, un LoRA con `peft` aplica directo.

**Flujo real, de punta a punta**: `POST /api/jobs/finetune` → `StartFineTune`
lanza el entrenamiento en un hilo de fondo (sostiene `engine_lock` mientras
entrena, para pausar `Decide` — ver brief: "durante un fine-tuning, neo-model
pausa la inferencia") → `WatchJob` transmite `step/loss/eta` reales por una
cola por job → al terminar guarda el adaptador versionado en
`/data/adapters/<job_id>` y libera el lock.

**El caso sintético normal ya estaba al 100% de concordancia (ver Fase 2):
sin margen para medir una mejora real.** Se agregó una variante "hard" al
generador (`data/generate_documents.py --difficulty hard`): plantillas que
evitan a propósito las palabras que delatan la categoría ("contrato",
"factura", "reporte"), para que el modelo base no acierte siempre.

**Medido de verdad, con el modelo cargado en GPU real** (reporte completo en
`bench/fase3_calibracion.md`):
- Antes del fine-tuning (modelo base, set `documents_hard_test.jsonl`, 300 docs): **concordancia 0.8767, ECE 0.2853**.
- Después (LoRA entrenado en 1000 docs del mismo tipo "hard", 3 épocas): **concordancia 1.0000, ECE 0.0000**.
- **Salvedad honesta**: el loss de entrenamiento cayó a ~0 en los primeros 12 pasos de 750 (`lr=1e-4` fue más alto de lo necesario) — el adaptador memorizó rápido las 3 plantillas por categoría, no necesariamente generalizó a frases genuinamente distintas. Train y test comparten las mismas plantillas (solo cambian nombres/montos/fechas). La mejora es real y medida, confirma que el pipeline funciona de punta a punta, pero no es evidencia de generalización robusta.

**Un hallazgo real de incompatibilidad `peft` ↔ `qev`, no un bug nuestro**:
`DecisionEngine._run_one` llama `self.model.model(...)` directo para sacar
hidden states, asumiendo una clase concreta (`Qwen3_5ForCausalLM`). Si
`self.model` queda como un `PeftModel` sin fusionar, esa misma llamada cae
en el forward completo (logits, no hidden states) y truena con
`AttributeError: 'CausalLMOutputWithPast' object has no attribute
'last_hidden_state'`. El entrenamiento no se ve afectado (usa `forward()`
estándar), pero para **evaluar con el adaptador puesto hay que fusionarlo**
con `peft_model.merge_and_unload()` antes de usarlo con `DecisionEngine`
(ver `model/neo_model/train/compare_calibration.py`). El job de
entrenamiento (`lora.py`) usa `model.unload()` al terminar (sin fusionar) a
propósito: no promueve el adaptador a producción solo por entrenarlo, el
modelo en vivo vuelve a su estado base — "Go lo registra y el workflow
puede apuntarle" es trabajo pendiente, ver Qué falta.

**Pendiente, explícito**:
- ~~Go no registra el `adapter_uri` ni un workflow puede apuntar a un
  adaptador~~ — **cerrado después de la Fase 4** (`adapter:` en el workflow,
  `DecideRequest.adapter`, tabla `adapters`; ver abajo).
- El entrenamiento de prueba usó muchos más pasos de los necesarios (ver
  salvedad arriba); valdría la pena un criterio de parada temprana.
- No se probó reconectar `WatchJob` a un job ya en curso: `jobs.py` usa una
  `queue.Queue` de un solo consumidor por job — un segundo `WatchJob` sobre
  el mismo `job_id` después de que el primero se desconectó compite por los
  mismos eventos en vez de reproducir desde donde se quedó (a diferencia del
  backlog del Broker de Go en Fase 0). No se notó en el camino crítico, pero
  quedó documentado para no sorprender a quien lo use después.

## Front: app completa con modo demo (nov 2026)

`front/` es una app de 5 pantallas (Centro de control, Playground, Historial,
Workflows, Fine-tuning) con Tailwind v4 (`@tailwindcss/vite`, tokens en
`src/index.css`), `lucide-react` y fuentes Geist locales. Lo que importa saber:

- **Toda la UI habla con `NeoGateway`** (`src/api/gateway.ts`), con dos estrategias: `live` (HTTP + SSE reales, `src/api/client.ts`) y `demo` (simulación en el navegador con el mismo contrato, `src/api/mock/`). En modo `auto` se elige sondeando `/healthz`. Guía: `front/src/components/docs/guides/NeoGateway.md`.
- **`src/api/types.ts` es el espejo del contrato** de `back/internal/runs/events.go`, `jobs/service.go` y `httpapi/handlers.go`. Si cambia un payload allá, cambia aquí.
- `src/api/sse.ts` **cierra el `EventSource` al recibir el evento terminal**: neo-api cierra el stream al terminar y el Broker reproduce el backlog, así que sin ese cierre los eventos se repetían cada ~3 s (bug real del front de Fase 0). Los reducers además descartan ids repetidos.
- El historial combina `localStorage` (etapas, errores, runs demo) con la bitácora vía `GET /api/runs` (fuente de verdad de la decisión).
- **`web` corre en Compose**: `front/Dockerfile` (build con Node, sirve nginx) en `http://localhost:5173` (`NEO_WEB_PORT`). `front/nginx.conf` hace proxy de `/api` y `/healthz` a neo-api con `proxy_buffering off` (sin eso el SSE llega a trozos) y resuelve `neo-api` por petición (`resolver 127.0.0.11`), así que recrear neo-api no deja a nginx con una IP vieja.

## neo-api: health checks y bitácora legible (nov 2026)

- `/healthz` revisa `postgres`, `neo-vector` y `neo-model` en paralelo (los dos últimos con su RPC `Health`, que ya estaba en el `.proto`). `HealthCheck.Critical`: solo `postgres` es crítico (503 → el healthcheck de Docker marca unhealthy). Si falla neo-vector o neo-model, la respuesta sigue en 200 con `ok:false`: neo-api sigue sirviendo workflows y bitácora, y reporta los errores por SSE.
- **Bug real corregido**: la bitácora guardaba `input_text` vacío en todos los runs (`stageCascade` nunca llenaba `ledger.Decision.InputText`). Las filas anteriores al fix se quedan así: `decisions` es append-only.
- Para probar con texto acentuado, no uses `curl -d` desde Git Bash en Windows: corrompe el UTF-8 en la línea de comandos antes de enviarlo (verificado: el mismo body desde Linux o el navegador llega bien). Usa `--data-binary @archivo.json` o prueba desde un contenedor.
- **Operar el stack sin interrumpir a otros**: siempre con los dos archivos (`-f compose.yaml -f compose.gpu.yaml`, así se levantó) y `up -d --no-deps <servicio>` para recrear solo lo que cambió. Construir (`compose build`) no toca contenedores en ejecución.

## Operación segura tras la Fase 4 (nov 2026)

- La base (`compose.yaml` + `compose.gpu.yaml`) mantiene una sola réplica de `neo-model`, suficiente para inferencia y fine-tuning en la RTX 4060 de 8 GB. `compose.scale.yaml` es opt-in para medir concurrencia; no debe activarse durante LoRA porque dos réplicas dejan la GPU sin memoria.
- `back/internal/grpcconn/h2c.go` no fija un timeout global al cliente HTTP/2: cada RPC conserva su contexto. Así `WatchJob` puede transmitir entrenamientos de más de 30 s sin cortar el stream.

## Fase 4: trazas distribuidas y carga real (nov 2026)

Instrumentación completa con OpenTelemetry en los 4 lenguajes, exportando por
OTLP a Jaeger (`docker compose`, servicio `jaeger`, UI en `localhost:16686`):

- **Go** (`back/internal/otelsetup`): `otelhttp` en el handler HTTP (extrae el
  `traceparent` del navegador) + interceptor `otelconnect` en cada cliente
  gRPC (`vectorclient`, `modelclient`, `provider/local`) para propagarlo a
  Rust y Python.
- **Rust** (`vector/src/otel.rs`): tonic no tiene middleware oficial de OTel
  todavía, así que el `traceparent` se extrae a mano de los metadata gRPC
  entrantes (`opentelemetry::propagation::Extractor` sobre
  `tonic::metadata::MetadataMap`) y el span se parenta con
  `tracing_opentelemetry::OpenTelemetrySpanExt::set_parent` +
  `tracing::Instrument` (no sirve `span.enter()` a través de un `.await`).
- **Python** (`model/neo_model/otel_setup.py`): `GrpcInstrumentorServer().instrument()`
  parchea `grpc.server()` antes de crearlo — extrae el contexto y abre el
  span de cada RPC solo, sin tocar `decide.py` ni `jobs.py`.
- **TypeScript** (`front/src/otel.ts`): `@opentelemetry/instrumentation-fetch`
  instrumenta el `fetch` global que ya usa `src/api/client.ts`; exporta por
  OTLP/**HTTP** (el navegador no puede hablar gRPC) a `localhost:4318`. Como
  `/api` es same-origin (proxy de Vite o de nginx), no hace falta
  `propagateTraceHeaderCorsUrls`.

**Gotcha real de versiones (npm)**: el ecosistema `@opentelemetry/*` está a
mitad de una migración — `resources`/`instrumentation`/`exporter-trace-otlp-http`
ya saltaron a depender de `api@>=1.10.0`, pero `sdk-trace-web` (el único
paquete que da `WebTracerProvider` para navegador) sigue en `2.12.0` y pide
`api@<1.10.0`. No hay combinación de "todo lo último" que resuelva sin
conflicto de peer deps. Se fijó el tren viejo y consistente: `api@1.9.1`,
`sdk-trace-web@2.12.0`, `resources@2.12.0`, `instrumentation@0.223.0`,
`instrumentation-fetch@0.223.0`, `exporter-trace-otlp-http@0.223.0`,
`context-zone@2.12.0` — verificado que resuelve sin `ERESOLVE` y que
`BatchSpanProcessor` de ese tren todavía toma `(exporter, config?)` posicional
(no el `{exporter}` por opciones de la nueva `@opentelemetry/sdk-trace`, que
es a donde migra `sdk-trace-base@2.12.0` por dentro vía un shim de
compatibilidad — `BasicTracerProvider` ahí ya es solo un wrapper).

**Bug real encontrado y corregido** (no hipotético): el primer run de prueba
mostró el span de `POST /api/runs` sin hijos en Jaeger. `runs.Service.run()`
procesa cada run en un goroutine de fondo (`go s.run(...)`, ver
`StartRun`/`Events` arriba en Contratos) con `context.Background()` nuevo,
desconectado del contexto de la request HTTP — correcto para no heredar su
cancelación (el run sigue vivo después de que `POST /api/runs` ya respondió
el `run_id`), pero también perdía el traceparent. Se corrigió con
`context.WithoutCancel(ctx)` (Go 1.21+): hereda los valores del contexto
(incluida la traza) sin heredar la cancelación. `handleStartRun` ahora pasa
`r.Context()` a `StartRun`.

**Verificado de punta a punta, no solo "debería funcionar"**: un run real
disparado desde la UI en Docker (no un curl suelto) produjo una sola traza
de 6 spans en Jaeger — `web` → `neo-api POST /api/runs` → (`VectorService/Search`
→ `neo-vector.search`) y (`ModelService/Decide` → `neo-model Decide`) —
parentada correctamente en las 4 capas. Detalle completo y el benchmark de
carga en `bench/fase4_trazas_carga.md`.

**Medido de verdad con k6** (`bench/fase4_loadtest.js`, contra el stack
completo en Docker, GPU real) — resumen, ver el reporte para la tabla y el
porqué: a 2 VUs concurrentes el pipeline responde sano (p50 2.4s, p95 3.8s,
0 timeouts); a 10 VUs **el 81% de los runs (487/600) expira** a los 30s de
`runTimeout` (`"context deadline exceeded"` en el log de `neo-api`). Causa
real: ni `neo-model` (un `DecisionEngine` único en GPU, serializado por
`engine_lock`, sin batching) ni `neo-vector` (`fastembed` tras un `Mutex`,
ya identificado como cuello de botella en la Fase 1) escalan horizontalmente
hoy — son procesos con estado en memoria, no servicios sin estado
replicables. **Decisión pendiente con Oscar, no tomada aquí**: pool de
instancias, batching de `Decide`, o aceptar la cola con una señal visible en
el front — cualquiera de las tres antes de llevar esta pieza a un
"Ecosistema Ferrer IA" con más de un puñado de usuarios concurrentes.
**Tomada después**: pool de embedders en neo-vector y réplicas de neo-model
con round-robin en Go (ver la sección siguiente). Batching de `Decide` y la
cola visible en el front siguen sin hacerse.

## Después de la Fase 4: concurrencia, adaptadores y el millón (nov 2026)

Reporte completo con tablas: `bench/fase5_concurrencia.md`. Patrones nuevos
aprobados por Oscar antes de implementarlos: Object Pool (neo-vector) y
round-robin con failover del lado de Go (neo-model).

- **Pool de embedders** (`vector/src/embed/pool.rs`): N `TextEmbedding`, cada uno con `with_intra_threads(cores/N)`, prestados con un semáforo de tokio y devueltos en `Drop` (también tras un panic, hay prueba). `NEO_VECTOR_EMBED_POOL`, default **2** (en `main.rs` y en `compose.yaml`). ghz, 10 conexiones: Mutex p95 277 ms / 46.7 rps → pool 2: 69 ms / 159 rps (1.9 GB) → pool 4: 38 ms / 311 rps (3.4 GB). El default no es 4 por memoria (ver gotcha abajo).
- **Réplicas de neo-model** (`back/internal/grpcconn/ring.go`, `provider/local`): `NEO_MODEL_ADDR` acepta varias direcciones separadas por coma; round-robin y, si una réplica responde `Unavailable` (entrenando, lock ocupado más de `NEO_MODEL_DECIDE_LOCK_TIMEOUT` = 20 s, o caída), prueba la siguiente en el mismo intento. `NotFound` (adaptador inexistente) no se reintenta. `modelclient` reserva la réplica que entrena para que dos fine-tunes no caigan en la misma. Medido (k6, 10 usuarios): 1.91 → 3.63 decisiones/s con 2 réplicas en la misma GPU (×1.9); con 2 usuarios, p95 de 3.1 s → 0.54 s. Sigue saturado a 10 usuarios.
- **Adaptadores LoRA en producción**: `adapter: "<job_id>"` en `workflows/*.yaml` (solo con provider local; validado en `workflow.go`), `DecideRequest.adapter` y `ModelHealthResponse.training` en el `.proto`. `model/neo_model/adapters.py` carga cada adaptador como `PeftModel` sin fusionar y cambia con `set_adapter` por petición; `engine.model` sigue siendo el objeto HF original (asignar el wrapper de peft era lo que rompía `_run_one` en la Fase 3). neo-api registra el adaptador al terminar el job (tabla `adapters`, migración `0002`, `GET /api/adapters`) y la bitácora guarda qué adaptador usó cada decisión. `bench/adapter_e2e.py`: base 50/60 vs. LoRA 60/60 por neo-api, sin errores.
- **Migraciones**: neo-api las aplica al arrancar (`ledger/migrate.go`, tabla `schema_migrations`) porque el `initdb` de Postgres solo corre con un volumen vacío.
- **Kernels de qev**: `flash-linear-attention` no mejoró nada medible (p50 249 → 245 ms), no se agregó; `causal-conv1d` necesita `nvcc`.
- **Millón de vectores**: carga a 160 docs/s (1.7 h por instancia), usearch con 4.7 GB de RAM, p95 secuencial 23 ms y 67 ms con 10 conexiones (lo mismo que a 2000: domina el embedding). **recall@10 cae a 0.793** (0.993 a 2000); los empates explican solo ~2-3 puntos (`bench/record_topk.py ties`). Era usearch con parámetros por defecto (16/128/64) sobre datos sintéticos muy agrupados. **Afinado**: `HnswParams` (`vector/src/index/usearch_index.rs`, env `NEO_VECTOR_HNSW_*`) con default 32/256/512, elegido con `bench/hnsw_sweep.py` (embebe 1M en GPU en 206 s y prueba índices fuera del servicio; usa la versión Python de usearch 2.26.6). Validado en el servicio: recall@10 0.793 → **0.849**, p95 secuencial 23 → 27 ms, igual bajo carga (71 ms, 161/s). El techo con estos datos es ~0.87 aunque suba `expansion_search`. La fuerza bruta propia a 1M: p95 203 ms secuencial.

**Gotchas de esta máquina** (no del código):
- La VM de Docker tiene 7.4 GB y el host suele tener ~10 GB ocupados por otras apps: compilar Rust con neo-model arriba tiró la VM varias veces. `vector/Dockerfile` limita `CARGO_BUILD_JOBS` y usa cachés de BuildKit; detén las réplicas de neo-model antes de compilar.
- El `.env` trae `NEO_MODEL_DEVICE=cpu`: `compose.scale.yaml` usa `NEO_MODEL_SCALE_DEVICE` (default `cuda`) para que la segunda réplica no quede en CPU sin avisar, y `ports: !reset []` porque `extends` fusiona listas.
- El Python del host perdió `grpcio`; los scripts de `bench/` se corren dentro de la imagen de neo-model: `MSYS_NO_PATHCONV=1 docker run --rm --network neo-workflows_default -v "D:\Apps\NEO:/w" -w /w --entrypoint python neo-workflows-neo-model bench/<script>.py ...`.

Lo que queda pendiente, explícitamente fuera de este alcance:

- [ ] Resolver o aceptar como deuda técnica el bloqueo de `typescript-eslint` contra TS7 (`npm run lint` no corre; `tsc --noEmit` sí).
- [x] Benchmark de Fase 1 al millón de vectores (ver "Después de la Fase 4").
- [x] Recall de usearch a 1M: afinado de 0.793 a 0.849 (techo ~0.87 con estos datos sintéticos; más allá haría falta reordenar con fuerza bruta un top-N amplio).
- [ ] Preguntas abiertas del brief que siguen pendientes: acceso a Jev, categorías reales del caso de clasificación (las de `data/generate_documents.py` son un placeholder razonable, no una decisión final), metas numéricas de cada métrica. **Ya resueltas con Oscar**: GPU = RTX 4060 (8GB); modelo de embeddings = `intfloat/multilingual-e5-small`; índice ANN = `usearch` (comparado contra fuerza bruta propia); modelo System One = `OmniJev/OneJev-0.8B` vía `qev`.
- [ ] **Concurrencia de neo-model**: pool de embedders y réplicas ya están; a 10 usuarios sigue saturado (~3.6 decisiones/s con 2 réplicas). Falta decidir batching de `Decide`, más GPU o una cola visible en el front.
- [ ] Criterio de parada temprana en el LoRA y reconexión de `WatchJob` a un job en curso (ver Fase 3).
