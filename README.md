# NEO Workflows

Servicio de decisiones tipadas estilo "System One": un workflow toma un texto,
busca precedentes por similitud semántica, le hace preguntas tipadas a un
modelo local (`noul` | `choice` | `score`) y decide por cascada de confianza.
Cada decisión queda en una bitácora append-only. Proyecto personal, corre
completo en local con Docker y una GPU.

| Servicio | Directorio | Lenguaje | Qué hace |
| --- | --- | --- | --- |
| `web` | [`front/`](front/) | TypeScript 7 + React + Vite | UI: centro de control, playground, historial, workflows, fine-tuning |
| `neo-api` | [`back/`](back/) | Go | Lógica de negocio, cascada, bitácora (PostgreSQL), HTTP + SSE |
| `neo-vector` | [`vector/`](vector/) | Rust | Embeddings (multilingual-e5-small) e índice ANN (usearch / HNSW) |
| `neo-model` | [`model/`](model/) | Python | Inferencia con OneJev-0.8B y fine-tuning LoRA |

Contratos entre servicios en [`proto/neo/v1/`](proto/neo/v1/) (gRPC);
workflows en [`workflows/`](workflows/).

## Levantarlo

```bash
cp .env.example .env
docker compose -f compose.yaml -f compose.gpu.yaml up -d
```

- UI: <http://localhost:5173>
- API: <http://localhost:8080/healthz>
- Trazas (Jaeger): <http://localhost:16686>

Overlays opcionales: `compose.scale.yaml` (segunda réplica de neo-model,
no usar durante un fine-tuning) y `compose.bench.yaml` (instancia de fuerza
bruta de neo-vector para medir recall).

## Documentación

- [Manual de uso (PDF)](docs/manual/NEO-Workflows-Manual.pdf); la fuente y
  `build.js` están en [`docs/manual/`](docs/manual/).
- [`CLAUDE.md`](CLAUDE.md): reglas, contratos, versiones fijadas y la
  bitácora técnica de cada fase (qué se midió, qué se corrigió, qué falta).
- Benchmarks medidos en [`bench/`](bench/): calibración y LoRA
  (`fase3_calibracion.md`), trazas y carga (`fase4_trazas_carga.md`),
  concurrencia, adaptadores y el millón de vectores (`fase5_concurrencia.md`).

Los datos de prueba son sintéticos ([`data/generate_documents.py`](data/generate_documents.py)).
