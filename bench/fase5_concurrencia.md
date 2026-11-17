# Después de la Fase 4 · Concurrencia, adaptadores y el millón de vectores

Tres pendientes que dejó la Fase 4, hechos y medidos en esta máquina (RTX 4060
Laptop de 8 GB, 16 núcleos, VM de Docker con 7.4 GB). Todo con el stack real
en Docker, no simulado.

## 1. neo-vector: pool de embedders en lugar del Mutex

`vector/src/embed/pool.rs` (Object Pool, aprobado por Oscar): N instancias de
`TextEmbedding`, cada una con su parte de los núcleos
(`with_intra_threads(cores / N)`), prestadas con un semáforo de tokio y
devueltas al soltarse (también tras un panic: dos pruebas nuevas lo cubren).

Mismos 2000 documentos, `bench/loadtest.sh` (ghz, 10 conexiones, 2000 búsquedas):

| Embedders | p95 | Promedio | Búsquedas/s | RAM de neo-vector | Carga (docs/s) |
| --- | --- | --- | --- | --- | --- |
| Mutex único (antes, medido hoy) | 277 ms | 214 ms | 46.7 | 1.4 GB | 102 |
| 1 | 200 ms | 188 ms | 53 | 1.1 GB | 138 |
| 2 (default) | 69 ms | 63 ms | 159 | 1.9 GB | 203 |
| 4 | 38 ms | 32 ms | 311 | 3.4 GB | 182 |

Una instancia con los 16 núcleos no gana nada embebiendo una consulta corta;
varias con pocos núcleos cada una sí. El costo es memoria: ~0.7 GB por
instancia. El default quedó en **2** porque esta VM de Docker se cayó dos
veces por memoria durante el trabajo; con más RAM, `NEO_VECTOR_EMBED_POOL=4`
duplica el rendimiento otra vez.

## 2. neo-model: réplicas con balanceo en neo-api

`back/internal/grpcconn/ring.go` (round-robin del lado de Go, aprobado por
Oscar; hace falta porque gRPC fija una sola conexión HTTP/2). Si una réplica
responde `Unavailable` (entrenando, ocupada o caída), `provider/local` prueba
la siguiente en el mismo intento. La segunda réplica es opt-in
(`compose.scale.yaml`): la base queda con una, porque dos modelos cargados
(~1.9 GB de VRAM cada uno) no dejan sitio para un fine-tuning en 8 GB.

`bench/carga_runs.sh` (k6 sobre `POST /api/runs` + latencia real de la
bitácora + runs expirados en el log de neo-api; 0.5 s entre peticiones por
usuario, 30 s):

| Usuarios | Réplicas | Completados | Expirados (30 s) | p50 | p95 | Decisiones/s |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 1 | 120/120 | 0 | 2.1 s | 3.1 s | — |
| 2 | 2 | 120/120 | 0 | 0.44 s | 0.54 s | — |
| 10 | 1 | 124/600 | 476 (79%) | 15.5 s | 28.6 s | 1.91 |
| 10 | 2 | 236/600 | 364 (61%) | 18.3 s | 29.9 s | 3.63 |

Dos réplicas en la **misma** GPU casi duplican el rendimiento (×1.9): cada
`Decide` deja a la GPU ociosa buena parte del tiempo, así que dos procesos se
enciman bien. Con 2 usuarios la cola desaparece (p95 de 3.1 s a 0.54 s). Con
10 usuarios (~20 peticiones/s) sigue saturado: el techo pasa de ~2 a ~3.6
decisiones/s, todavía lejos de esa demanda.

**Kernels de qev**: se probó `flash-linear-attention` 0.6.0 (el aviso de
"fallback lento" de transformers). `bench/decide_latency.py`, 30 decisiones en
caliente: p50 249 ms sin él, 245 ms con él — sin mejora medible, no se agregó.
`causal-conv1d` solo se publica como código fuente y necesita `nvcc`, que la
imagen runtime no trae.

## 3. Ciclo de fine-tuning cerrado

Contrato primero: `DecideRequest.adapter` y `ModelHealthResponse.training` en
`proto/neo/v1/model.proto`. Un workflow apunta a un adaptador con
`adapter: "<job_id>"` (`workflows/clasificar-documento-lora.yaml`); neo-model
lo aplica sin fusionar, cambiando de adaptador por petición
(`model/neo_model/adapters.py`); neo-api registra cada adaptador al terminar
el job (tabla `adapters`, migración `0002`, `GET /api/adapters`) y guarda en
la bitácora qué adaptador usó cada decisión.

`bench/adapter_e2e.py`: los mismos 60 documentos "hard" por los dos workflows,
a través de neo-api y leídos de la bitácora:

| Workflow | Adaptador | Acierto en `categoria` |
| --- | --- | --- |
| clasificar-documento | (modelo base) | 50/60 (83%) |
| clasificar-documento-lora | 334a72fe… (Fase 3) | 60/60 (100%) |

Coincide con la Fase 3 (0.877 → 1.000), ahora por el camino de producción y
alternando base/adaptador en la misma réplica, sin errores. La misma salvedad
de la Fase 3 aplica: el adaptador memorizó plantillas sintéticas.

## 4. Benchmark al millón de vectores

El pendiente de la Fase 1: `data/generate_documents.py --n 1000000`, cargado
con `data/bulk_load.py` (2 hilos, lotes de 128). neo-model apagado durante
toda la corrida (aprobado por Oscar): con 7.4 GB en la VM de Docker no caben
a la vez neo-model, dos neo-vector con un millón cada uno y la carga.

Por la misma razón no se pudieron tener vivas las dos instancias (usearch y
fuerza bruta) como en la Fase 1: `bench/record_topk.py` graba el top-10 de
200 consultas fijas contra usearch, luego se recrea neo-vector con
`NEO_VECTOR_INDEX_IMPL=bruteforce`, se vuelve a cargar el millón, se graban
las mismas consultas y se comparan las dos grabaciones.

| Medida | 2000 docs (Fase 1) | 1,000,000 docs |
| --- | --- | --- |
| Carga (docs/s) | 203 (pool 2) | 160 (6232 s en total) |
| RAM de neo-vector (usearch) | 1.9 GB | 4.7 GB |
| Búsqueda secuencial p50 / p95 | — / 32.3 ms (Mutex) | 20.8 / 23.3 ms |
| ghz 10 conexiones: p95 | 69 ms | 67 ms |
| ghz 10 conexiones: búsquedas/s | 159 | 160 |
| recall@10 (usearch vs. fuerza bruta) | 0.993 | **0.793** |
| Fuerza bruta: búsqueda secuencial p50 / p95 | — | 170.5 / 203.1 ms |
| Fuerza bruta: carga (docs/s), RAM | — | 170, 4.2 GB |

Con el pool de embedders, la búsqueda en HNSW a un millón cuesta lo mismo que
a 2000: casi todo el tiempo de una búsqueda es embeber la consulta, no
recorrer el índice.

**El recall sí se cae: de 0.993 a 0.793.** Para descartar que fueran empates
(con plantillas sintéticas, a un millón hay muchos documentos casi iguales),
`bench/record_topk.py ties` vuelve a consultar la instancia exacta con
top-200 y cuenta como acierto cualquier id de usearch cuyo score exacto
empate con el décimo:

| Tolerancia al empate | recall@10 | Vecinos empatados con el 10.º (mediana) |
| --- | --- | --- |
| estricto | 0.793 | — |
| 1e-6 | 0.813 | 1 |
| 1e-4 | 0.817 | 4 |
| 1e-3 | 0.823 | 41 |

Los empates explican ~2-3 puntos, no 20. La caída es de usearch con sus
parámetros por defecto (`connectivity`, `expansion_add` y `expansion_search`
en 0 en `vector/src/index/usearch_index.rs`, es decir 16 / 128 / 64) sobre
datos muy agrupados. Lo siguiente sería subir `expansion_search` (se puede
cambiar sin reconstruir el índice) y, si no alcanza, `connectivity` y
`expansion_add`. Cada prueba cuesta otra carga de 1.7 h, así que no se hizo
aquí. Como referencia, la fuerza bruta propia responde en 203 ms de p95
secuencial a un millón: recall exacto, pero ~9× más lenta.

### Afinado de HNSW

Recargar el millón cuesta 1.7 h por prueba, así que los parámetros se
eligieron fuera del servicio: `bench/hnsw_sweep.py` embebe el millón en GPU
con el mismo modelo (206 s) y construye índices con el mismo motor (usearch
2.26.6 de Python) contra la verdad exacta calculada en GPU. Con los
defaults reproduce el problema (0.816 contra 0.793 en el servicio):

| connectivity / expansion_add | ef=64 | ef=256 | ef=512 | ef=1024 | Construcción | Índice |
| --- | --- | --- | --- | --- | --- | --- |
| 16 / 128 (default) | 0.816 | 0.837 | 0.841 | 0.841 | 80 s | 2.3 GB |
| 32 / 256 | 0.837 | 0.866 | 0.869 | 0.871 | 195 s | 2.6 GB |
| 64 / 512 | 0.857 | 0.861 | 0.873 | 0.873 | 689 s | 3.1 GB |

El recall se estanca en ~0.87 aunque crezca `expansion_search`, así que lo
que falta no es profundidad de búsqueda: con tantos vectores casi idénticos,
la poda de vecinos de HNSW deja nodos difíciles de alcanzar (más los
empates de arriba). Se fijó **32 / 256 / 512** como default de neo-vector
(`HnswParams` en `vector/src/index/usearch_index.rs`, ajustable con
`NEO_VECTOR_HNSW_CONNECTIVITY`, `_EXPANSION_ADD` y `_EXPANSION_SEARCH`).

Validado en el servicio real, con otra carga del millón (150 docs/s, 4.6 GB):

| usearch a 1M | recall@10 | Secuencial p50 / p95 | ghz 10 conexiones p95 | Búsquedas/s |
| --- | --- | --- | --- | --- |
| Defaults (16 / 128 / 64) | 0.793 | 20.8 / 23.3 ms | 67 ms | 160 |
| Afinado (32 / 256 / 512) | **0.849** | 22.4 / 27.0 ms | 71 ms | 161 |

+5.6 puntos de recall por ~4 ms más de búsqueda y el mismo rendimiento bajo
carga. Para pasar de ~0.87 con estos datos haría falta otra cosa (reordenar
con fuerza bruta un top-N más amplio, o datos menos repetitivos que las
plantillas sintéticas); no se hizo.

Las grabaciones están en `bench/topk_usearch_1m.json`, `bench/topk_usearch_tuned_1m.json` y
`bench/topk_exact_1m.json`; los logs de carga, en
`bench/results_load_*_1m.log` y el barrido en `bench/results_hnsw_sweep_1m.log`. Al terminar, neo-vector se recreó con su
configuración normal (usearch, capacidad 100,000, índice vacío) y neo-model
se levantó de nuevo.
