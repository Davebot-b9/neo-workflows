#!/usr/bin/env bash
# Corre bench/fase4_loadtest.js (k6) y resume lo que de verdad pasó con los
# runs: cuántos llegaron a la bitácora, su latencia de pipeline (latency_ms
# que mide neo-api) y cuántos expiraron (runTimeout de 30 s en el log de
# neo-api). POST /api/runs responde 202 al instante, así que el resumen de
# k6 por sí solo no dice nada del pipeline.
#
# Uso: bench/carga_runs.sh [vus] [etiqueta]
set -euo pipefail
export MSYS_NO_PATHCONV=1

VUS="${1:-10}"
LABEL="${2:-}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL=(docker exec neo-workflows-postgres-1 psql -U neo -d neo -tA -F' ')

START=$("${PSQL[@]}" -c "select now()")
docker run --rm --network neo-workflows_default -v "$ROOT_DIR/bench:/scripts" \
  grafana/k6:1.3.0 run --quiet --env VUS="$VUS" /scripts/fase4_loadtest.js >/dev/null

# Deja terminar lo que siguió en cola (runTimeout = 30 s) antes de contar.
sleep 35

read -r N P50 P95 MAX < <("${PSQL[@]}" -c "
  select count(*),
         coalesce(percentile_cont(0.5) within group (order by latency_ms), 0)::int,
         coalesce(percentile_cont(0.95) within group (order by latency_ms), 0)::int,
         coalesce(max(latency_ms), 0)
  from decisions where created_at >= '$START'")
SINCE=$(date -u -d "$START" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo 2m)
TIMEOUTS=$(docker logs --since "$SINCE" neo-workflows-neo-api-1 2>&1 | grep -c "ERROR runs: fallo" || true)
SENT=$((VUS * 60))

echo "${LABEL} vus=${VUS} enviados≈${SENT} completados=${N} fallidos=${TIMEOUTS} decidir+buscar p50=${P50}ms p95=${P95}ms max=${MAX}ms rendimiento=$(awk "BEGIN{printf \"%.2f\", ${N}/65}") decisiones/s"
