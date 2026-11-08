# Fase 4 · Trazas distribuidas y carga real

## Traza de punta a punta (las 4 capas)

Run real disparado desde la UI (`front/`, Docker, no un curl suelto), visto en Jaeger
(`http://localhost:16686`), traceID `7690898ef2dbbcf339ae731c85a50442`:

```
web POST                                    (navegador, instrumentación de fetch)
└─ neo-api POST /api/runs                   (otelhttp extrae el traceparent del navegador)
   ├─ neo-api neo.v1.VectorService/Search
   │  └─ neo-vector neo-vector.search       (Rust, extraído a mano de los metadata gRPC)
   └─ neo-api neo.v1.ModelService/Decide
      └─ neo-model /neo.v1.ModelService/Decide   (Python, GrpcInstrumentorServer)
```

6 spans, un solo traceID, parentados correctamente de punta a punta: TypeScript → Go → Rust
y Go → Python. Jaeger recibe los spans por OTLP/gRPC (Go, Rust, Python) y OTLP/HTTP (el
navegador no puede hablar gRPC).

**Hallazgo real corregido en el camino**: el primer intento de este run (antes de este fix)
salía con el span de `POST /api/runs` sin hijos — `runs.Service.run()` procesaba el run en un
goroutine de fondo con `context.Background()` nuevo, desconectado del contexto (y de la traza)
de la request HTTP. `POST /api/runs` responde de inmediato con el `run_id` y el procesamiento
real sigue después (el front se entera por SSE), así que no puede quedar atado a la
cancelación de esa request — pero sí puede heredar su traza. Se corrigió con
`context.WithoutCancel(ctx)` (`back/internal/runs/service.go`): hereda el traceparent y los
demás valores del contexto, sin heredar su cancelación.

## Carga real contra `POST /api/runs` (k6, `bench/fase4_loadtest.js`)

Corrido con `docker run --network neo-workflows_default grafana/k6:1.3.0 run
bench/fase4_loadtest.js`, contra el stack completo en Docker (GPU real, no simulado).
`POST /api/runs` responde `202` casi de inmediato (encola el run); la latencia real del
pipeline (`buscar-precedentes` + `decidir` + cascada) se mide aparte, vía la bitácora
(`GET /api/runs`) y los `ERROR runs: fallo en el run ... context deadline exceeded` del log
de `neo-api` cuando un run no termina dentro del `runTimeout` de 30s.

| Concurrencia (VUs) | Runs enviados | Runs completados (bitácora) | Timeouts (30s) | latencia pipeline p50 | p95 | max |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 120 | 76 (ventana de 33s) | 0 | 2.4s | 3.8s | 3.9s |
| 10 | 600 | ~117 | **487 (81%)** | 15.4s | 28.7s | 29.6s (≈ runTimeout) |

**Esto es un cuello de botella real, no hipotético.** A 2 VUs (~4 req/s) el pipeline
responde sano. A 10 VUs (~20 req/s) el 81% de los runs expira a los 30s: `neo-model` sirve
`Decide` con un único `DecisionEngine` en GPU protegido por `engine_lock` (serializa, sin
batching — ver Fase 2/3) y `neo-vector` protege `fastembed` con un `Mutex` (ver Fase 1: ya
medido como cuello de botella bajo carga concurrente, p95 32ms→209ms con 10 conexiones). Con
~450ms de `Decide` + ~75ms de `Search` por run, la capacidad real es de ~2 runs/s en
serie; a 10 VUs la cola crece sin control hasta que los runs más viejos expiran.

**Decisión que esto exige antes de llevar esta pieza a producción multi-usuario**: ninguna
de las piezas (Go, Rust, Python) escala horizontalmente hoy — `neo-model` y `neo-vector`
son procesos únicos con estado (el modelo cargado, el índice en memoria). Antes de
"Ecosistema Ferrer IA" con más de un puñado de usuarios concurrentes, hace falta decidir
entre: (a) poner un pool de instancias de `neo-model`/`neo-vector` detrás de balanceo, (b)
batchear `Decide` (varias preguntas por pasada de GPU) o (c) aceptar la cola y subir
`runTimeout` con una señal de "en fila" visible en el front. No se implementó ninguna aquí:
es exactamente el tipo de decisión que pide el brief para esta fase, no una que se deba
tomar sin que Oscar la vea primero.
