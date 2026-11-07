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

- Front → `neo-api`: HTTP (comandos) + SSE (eventos), ver tabla de rutas en el brief (`POST /api/runs`, `GET /api/runs/{id}/events`, `POST /api/jobs/finetune`, `GET /api/jobs/{id}/events`, `GET /api/workflows`, `GET /healthz`).
- `neo-api` → `neo-vector` / `neo-model`: gRPC puro (no Connect), definido en `proto/neo/v1/*.proto`. Va en texto plano (h2c): `back/internal/grpcconn` arma el cliente HTTP/2 sin TLS que esto necesita.
- La forma de una decisión imita la API System One (`DecideRequest`/`DecideResponse` en `proto/neo/v1/model.proto`) para que Jev y el modelo local sean intercambiables sin tocar la lógica.
- **TODO bloqueante antes de la Fase 2**: confirmar contra docs.typesafe.ai los campos exactos de `choice` y `score` (ver `back/internal/provider/jev/jev.go`, que por ahora asume los mismos nombres que el proto interno).

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

Dependencias de cada servicio: ver `back/go.mod`, `vector/Cargo.toml`, `model/pyproject.toml`, `front/package.json`. De la Fase 1: `fastembed` 7.6.1, `usearch` 2.26.6, `rayon` 1.12.0 (crates.io, verificado).

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
- **p95 bajo carga concurrente (ghz, 10 conexiones): 209.5 ms** (`bench/loadtest.sh`) — más alto que el secuencial porque `Embedder` protege el modelo de fastembed con un `Mutex` (`vector/src/embed/mod.rs`): todas las llamadas de embedding se serializan, es el cuello de botella real bajo concurrencia. Queda como mejora de la Fase 4 (pool de instancias del modelo, o afinar el threading de `ort`), no se tocó aquí.

**Pendiente, explícito**: correr `data/generate_documents.py --n 1000000`, cargar con `data/bulk_load.py` en ambas instancias (`compose.bench.yaml` levanta la de fuerza bruta en el puerto 50061) y repetir `bench/measure_recall.py` + `bench/loadtest.sh` a esa escala. A ~120 docs/s de carga por instancia (medido), son ~2.3h por instancia — se decidió explícitamente no correrlo todavía; la metodología ya está validada end-to-end a escala pequeña.

Verificado con Docker real, no solo "debería compilar":
- `cargo build --release` y `cargo test` (4/4) corridos en `rust:1.99.1-trixie`. **Bookworm no sirve para este crate**: el runtime de ONNX que trae `ort` (dependencia de fastembed) necesita símbolos de glibc 2.38+ (`__isoc23_strtol` y afines) que Debian bookworm (glibc 2.36) no tiene — error de linking real, no hipotético. `vector/Dockerfile` usa `rust:1.99.1-trixie` / `debian:trixie-slim` para build y runtime (se abandonó `distroless` ahí: fastembed/onnxruntime necesitan más libs del sistema).
- `docker compose build/up` real, `Upsert` + `Search` probados con texto real en español vía gRPC: la consulta "factura atrasada que hay que cobrar" encontró correctamente las dos facturas vencidas por encima de un contrato y un reporte — similitud semántica real, no coincidencia de palabras.
- El modelo (~470MB) se cachea en el volumen `neo-vector-model-cache` (`/data/.fastembed_cache` dentro del contenedor); sin ese volumen se vuelve a bajar en cada `recreate`.

## Front: app completa con modo demo (nov 2026)

`front/` es una app de 5 pantallas (Centro de control, Playground, Historial,
Workflows, Fine-tuning) con Tailwind v4 (`@tailwindcss/vite`, tokens en
`src/index.css`), `lucide-react` y fuentes Geist locales. Lo que importa saber:

- **Toda la UI habla con `NeoGateway`** (`src/api/gateway.ts`), con dos estrategias: `live` (HTTP + SSE reales, `src/api/client.ts`) y `demo` (simulación en el navegador con el mismo contrato, `src/api/mock/`). En modo `auto` se elige sondeando `/healthz`. Guía: `front/src/components/docs/guides/NeoGateway.md`.
- **`src/api/types.ts` es el espejo del contrato** de `back/internal/runs/events.go`, `jobs/service.go` y `httpapi/handlers.go`. Si cambia un payload allá, cambia aquí.
- `src/api/sse.ts` **cierra el `EventSource` al recibir el evento terminal**: neo-api cierra el stream al terminar y el Broker reproduce el backlog, así que sin ese cierre los eventos se repetían cada ~3 s (bug real del front de Fase 0). Los reducers además descartan ids repetidos.
- El historial de runs vive en `localStorage` porque neo-api aún no expone un listado de `decisions`.
- `/healthz` hoy solo revisa `postgres`; la UI muestra neo-vector/neo-model como "sin sonda" hasta que Go agregue sus checks (los lee solos si aparecen en `deps`).

Lo que queda pendiente, explícitamente fuera de este alcance:

- [ ] Resolver o aceptar como deuda técnica el bloqueo de `typescript-eslint` contra TS7 (`npm run lint` no corre; `tsc --noEmit` sí).
- [ ] Benchmark de Fase 1 al millón de vectores (ver sección Fase 1 arriba) — metodología ya validada a 2000, falta la corrida larga.
- [ ] Preguntas abiertas del brief que siguen pendientes: modelo System One a usar, acceso a Jev, categorías reales del caso de clasificación (las de `data/generate_documents.py` son un placeholder razonable, no una decisión final), metas numéricas de cada métrica. **Ya resueltas con Oscar**: GPU = RTX 4060; modelo de embeddings = `intfloat/multilingual-e5-small`; índice ANN = `usearch` (comparado contra fuerza bruta propia).
