#!/usr/bin/env bash
# Carga con ghz contra el Search real de neo-vector (p95 de búsqueda).
# ghz no está instalado localmente: se baja el binario oficial una vez
# dentro de un contenedor desechable, conectado a la red de Compose para
# poder llamar al servicio por su nombre (neo-vector:50051), sin pasar por
# el puerto publicado en el host.
#
# Uso: bench/loadtest.sh [servicio] [concurrencia] [total_requests]
set -euo pipefail

# Git Bash (MSYS) traduce rutas que empiezan con / antes de pasarlas a
# Docker, lo que rompe -v /proto:... ; esto lo desactiva para este script.
export MSYS_NO_PATHCONV=1

SERVICE="${1:-neo-vector}"
CONCURRENCY="${2:-20}"
TOTAL="${3:-2000}"
GHZ_VERSION="v0.121.0"
NETWORK="neo-workflows_default"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker run --rm \
  --network "$NETWORK" \
  -v "$ROOT_DIR/proto:/proto:ro" \
  debian:bookworm-slim bash -c "
    set -e
    apt-get update -qq && apt-get install -y -qq --no-install-recommends curl ca-certificates > /dev/null
    curl -sL https://github.com/bojand/ghz/releases/download/${GHZ_VERSION}/ghz-linux-x86_64.tar.gz | tar xz -C /usr/local/bin ghz
    ghz --insecure \
      --proto neo/v1/vector.proto \
      --import-paths /proto \
      --call neo.v1.VectorService.Search \
      -d '{\"collection\":\"bench\",\"query_text\":\"Factura vencida de Comercial Aurora\",\"top_k\":10}' \
      -c ${CONCURRENCY} -n ${TOTAL} \
      ${SERVICE}:50051
  "
