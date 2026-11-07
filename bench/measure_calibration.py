"""Mide concordancia (accuracy) y ECE (Expected Calibration Error) del
modelo System One contra los documentos sintéticos etiquetados (Fase 2).
Llama a neo-model directamente por gRPC, sin pasar por neo-api: ECE mide la
calibración del MODELO, no del pipeline completo (búsqueda + cascada).

Uso:
    python bench/measure_calibration.py --addr localhost:50052 \
        --documents data/generated/documents_small.jsonl --samples 300 --bins 10
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import grpc

sys.path.insert(0, str(Path(__file__).parent.parent / "model" / "neo_model" / "genproto"))

from neo.v1 import model_pb2, model_pb2_grpc  # noqa: E402

# Mismas categorías que workflows/clasificar-documento.yaml (placeholder,
# ver CLAUDE.md: no es una decisión final de Oscar).
CRITERIA = {
    "contrato": "Acuerdos entre partes",
    "factura": "Cobros y pagos",
    "reporte": "Informes y resultados",
}


def sample_documents(path: Path, n: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    reservoir: list[dict] = []
    with path.open(encoding="utf-8") as f:
        for i, line in enumerate(f):
            doc = json.loads(line)
            if len(reservoir) < n:
                reservoir.append(doc)
            else:
                j = rng.randint(0, i)
                if j < n:
                    reservoir[j] = doc
    return reservoir


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--addr", default="localhost:50052")
    parser.add_argument("--documents", type=Path, default=Path("data/generated/documents_small.jsonl"))
    parser.add_argument("--samples", type=int, default=300)
    parser.add_argument("--bins", type=int, default=10)
    parser.add_argument("--seed", type=int, default=11)
    args = parser.parse_args()

    docs = sample_documents(args.documents, args.samples, args.seed)
    print(f"{len(docs)} documentos de muestra")

    channel = grpc.insecure_channel(args.addr)
    stub = model_pb2_grpc.ModelServiceStub(channel)

    correct = 0
    bin_correct = [0] * args.bins
    bin_total = [0] * args.bins
    bin_conf_sum = [0.0] * args.bins

    for i, doc in enumerate(docs):
        req = model_pb2.DecideRequest(
            model="OmniJev/OneJev-0.8B",
            state=f"Documento: {doc['text']}",
            questions={
                "categoria": model_pb2.Question(
                    type="choice",
                    instructions="¿A qué categoría pertenece el documento?",
                    choice_criteria=CRITERIA,
                )
            },
        )
        resp = stub.Decide(req, timeout=60)
        answer = resp.answers["categoria"].choice
        is_correct = answer.choice == doc["category"]
        correct += int(is_correct)

        b = min(int(answer.confidence * args.bins), args.bins - 1)
        bin_total[b] += 1
        bin_correct[b] += int(is_correct)
        bin_conf_sum[b] += answer.confidence

        if (i + 1) % 25 == 0:
            print(f"{i + 1}/{len(docs)}", flush=True)

    accuracy = correct / len(docs) if docs else float("nan")
    ece = 0.0
    print("\nbin | n | confianza media | accuracy")
    for b in range(args.bins):
        if bin_total[b] == 0:
            continue
        acc_b = bin_correct[b] / bin_total[b]
        conf_b = bin_conf_sum[b] / bin_total[b]
        ece += (bin_total[b] / len(docs)) * abs(acc_b - conf_b)
        print(f"{b:3d} | {bin_total[b]:3d} | {conf_b:.3f} | {acc_b:.3f}")

    print(f"\nconcordancia: {accuracy:.4f} ({correct}/{len(docs)})")
    print(f"ECE ({args.bins} bins): {ece:.4f}")


if __name__ == "__main__":
    main()
