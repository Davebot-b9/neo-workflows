import http from "k6/http";
import { check, sleep } from "k6";

// Fase 4: carga real contra neo-api (HTTP), no contra neo-vector/neo-model
// directo (eso ya se midio en la Fase 1 con ghz). El objetivo es ver el p95
// del camino completo: POST /api/runs -> buscar-precedentes (Rust) ->
// decidir (Python) -> cascada (Go) -> bitacora (Postgres). Como /api/runs
// responde 202 casi de inmediato (el run corre en segundo plano), la
// latencia real del pipeline se mide despues, por GET /api/runs, no aqui.
//
// Default: 2 VUs (sano, ver bench/fase4_trazas_carga.md). Para repetir el
// escenario de 10 VUs que satura el pipeline (81% de timeouts a 30s):
// k6 run --env VUS=10 bench/fase4_loadtest.js
export const options = {
  scenarios: {
    carga: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS) || 2,
      duration: "30s",
    },
  },
};

const DOCUMENTOS = [
  "Factura F-2026-0412 por 18,400 MXN. El pago vence hoy; favor de liquidar de inmediato para evitar recargos.",
  "Contrato de arrendamiento comercial, plazo forzoso de 24 meses, renta mensual de $45,000.00 mas IVA.",
  "Reporte trimestral de ventas Q3 2026: crecimiento del 12% respecto al trimestre anterior.",
  "Se adjunta documento para revision, favor de confirmar recepcion a la brevedad.",
];

export default function () {
  const body = JSON.stringify({
    workflow: "clasificar-documento",
    text: DOCUMENTOS[Math.floor(Math.random() * DOCUMENTOS.length)],
  });
  const res = http.post("http://neo-api:8080/api/runs", body, {
    headers: { "Content-Type": "application/json" },
  });
  check(res, { "202 Accepted": (r) => r.status === 202 });
  sleep(0.5);
}
