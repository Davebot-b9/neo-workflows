"""Latencia de DecisionEngine.decide() en caliente, sin red ni gRPC de por
medio: aísla cuánto tarda el modelo en sí. Se corre dentro de la imagen de
neo-model (mismo torch/CUDA/qev que producción):

    docker run --rm --gpus all -v neo-workflows_neo-model-cache:/data \
      -v "$PWD/bench:/bench" -e HF_HOME=/data/.hf_cache \
      neo-workflows-neo-model python /bench/decide_latency.py
"""

from __future__ import annotations

import statistics
import time

from qev.engine import DecisionEngine
from qev.schema import ChoiceQuestion, NoulQuestion, SystemOneRequest

STATE = (
    "Documento: Factura F-2026-0412 por 18,400 MXN. El pago vence hoy; favor de "
    "liquidar de inmediato para evitar recargos.\nPrecedentes: (5 documentos parecidos)"
)
QUESTIONS = {
    "categoria": ChoiceQuestion(
        type="choice",
        instructions="¿A qué categoría pertenece el documento?",
        criteria={"contrato": "Acuerdos entre partes", "factura": "Cobros y pagos", "reporte": "Informes y resultados"},
    ),
    "urgente": NoulQuestion(type="noul", instructions="¿El documento requiere atención inmediata?"),
}


def main() -> None:
    engine = DecisionEngine(model_path="OmniJev/OneJev-0.8B", device="cuda:0", dtype="bfloat16")
    request = SystemOneRequest(state=STATE, model="OmniJev/OneJev-0.8B", questions=QUESTIONS)

    for _ in range(3):
        engine.decide(request)

    samples = []
    for _ in range(30):
        t0 = time.perf_counter()
        engine.decide(request)
        samples.append((time.perf_counter() - t0) * 1000)

    samples.sort()
    print(
        f"decide (2 preguntas), 30 muestras en caliente: "
        f"p50={statistics.median(samples):.1f}ms p95={samples[int(len(samples) * 0.95) - 1]:.1f}ms "
        f"min={samples[0]:.1f}ms max={samples[-1]:.1f}ms"
    )


if __name__ == "__main__":
    main()
