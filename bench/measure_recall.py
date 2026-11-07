"""Mide recall@10: compara el top-k de usearch contra el top-k exacto de
fuerza bruta (el índice propio), para la misma muestra de consultas sobre la
misma colección. Necesita dos neo-vector corriendo con los mismos datos
cargados: uno con NEO_VECTOR_INDEX_IMPL=usearch y otro con =bruteforce (ver
compose.bench.yaml).

Uso:
    python bench/measure_recall.py \
        --approx-addr localhost:50051 --exact-addr localhost:50061 \
        --documents data/generated/documents.jsonl --samples 200 --k 10
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

import grpc

sys.path.insert(0, str(Path(__file__).parent.parent / "data" / "genproto"))

from neo.v1 import vector_pb2, vector_pb2_grpc  # noqa: E402


def sample_queries(path: Path, n: int, seed: int) -> list[str]:
    rng = random.Random(seed)
    reservoir: list[str] = []
    with path.open(encoding="utf-8") as f:
        for i, line in enumerate(f):
            text = json.loads(line)["text"]
            if len(reservoir) < n:
                reservoir.append(text)
            else:
                j = rng.randint(0, i)
                if j < n:
                    reservoir[j] = text
    return reservoir


def search(stub, collection: str, text: str, k: int) -> list[int]:
    resp = stub.Search(
        vector_pb2.SearchRequest(collection=collection, query_text=text, top_k=k),
        timeout=30,
    )
    return [m.id for m in resp.matches]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--approx-addr", default="localhost:50051", help="instancia con usearch")
    parser.add_argument("--exact-addr", default="localhost:50061", help="instancia con bruteforce")
    parser.add_argument("--collection", default="bench")
    parser.add_argument("--documents", type=Path, default=Path("data/generated/documents.jsonl"))
    parser.add_argument("--samples", type=int, default=200)
    parser.add_argument("--k", type=int, default=10)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    queries = sample_queries(args.documents, args.samples, args.seed)
    print(f"{len(queries)} consultas de muestra")

    approx_channel = grpc.insecure_channel(args.approx_addr)
    exact_channel = grpc.insecure_channel(args.exact_addr)
    approx_stub = vector_pb2_grpc.VectorServiceStub(approx_channel)
    exact_stub = vector_pb2_grpc.VectorServiceStub(exact_channel)

    recalls = []
    latencies_ms = []
    for i, text in enumerate(queries):
        exact_ids = set(search(exact_stub, args.collection, text, args.k))

        start = time.perf_counter()
        approx_ids = search(approx_stub, args.collection, text, args.k)
        latencies_ms.append((time.perf_counter() - start) * 1000)

        if exact_ids:
            overlap = len(exact_ids & set(approx_ids))
            recalls.append(overlap / len(exact_ids))

        if (i + 1) % 25 == 0:
            print(f"{i + 1}/{len(queries)}", flush=True)

    latencies_ms.sort()
    p95 = latencies_ms[int(len(latencies_ms) * 0.95) - 1] if latencies_ms else float("nan")
    avg_recall = sum(recalls) / len(recalls) if recalls else float("nan")

    print(f"\nrecall@{args.k}: {avg_recall:.4f} (sobre {len(recalls)} consultas)")
    print(f"p95 de búsqueda (approx, incluye red+embedding de la query): {p95:.1f} ms")
    print(f"p50: {latencies_ms[len(latencies_ms)//2]:.1f} ms" if latencies_ms else "")


if __name__ == "__main__":
    main()
