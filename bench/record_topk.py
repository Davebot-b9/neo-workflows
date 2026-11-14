"""Guarda el top-k de una instancia de neo-vector para una muestra fija de
consultas, y compara dos de esas grabaciones. Existe para el benchmark al
millón: con 7.4 GB de RAM en Docker no caben a la vez dos neo-vector con 1M
de documentos cada uno, así que se corre primero usearch, luego fuerza
bruta, con las mismas consultas, y se compara al final. measure_recall.py
sigue sirviendo para el caso chico (las dos instancias vivas a la vez).

    python bench/record_topk.py record --addr localhost:50051 --out bench/topk_usearch_1m.json
    python bench/record_topk.py record --addr localhost:50051 --out bench/topk_exact_1m.json
    python bench/record_topk.py compare bench/topk_usearch_1m.json bench/topk_exact_1m.json
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

import grpc

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "data" / "genproto"))

from measure_recall import sample_queries, search  # noqa: E402
from neo.v1 import vector_pb2, vector_pb2_grpc  # noqa: E402


def record(args) -> None:
    queries = sample_queries(args.documents, args.samples, args.seed)
    stub = vector_pb2_grpc.VectorServiceStub(grpc.insecure_channel(args.addr))
    detail = stub.Health(vector_pb2.HealthRequest(), timeout=10).detail

    results, latencies_ms = [], []
    for i, text in enumerate(queries):
        start = time.perf_counter()
        ids = search(stub, args.collection, text, args.k)
        latencies_ms.append((time.perf_counter() - start) * 1000)
        results.append(ids)
        if (i + 1) % 50 == 0:
            print(f"{i + 1}/{len(queries)}", flush=True)

    latencies_ms.sort()
    summary = {
        "addr": args.addr,
        "health": detail,
        "k": args.k,
        "samples": len(queries),
        "p50_ms": round(statistics.median(latencies_ms), 1),
        "p95_ms": round(latencies_ms[int(len(latencies_ms) * 0.95) - 1], 1),
        "queries": queries,
        "results": results,
    }
    args.out.write_text(json.dumps(summary, ensure_ascii=False), encoding="utf-8")
    print(f"{detail}: p50={summary['p50_ms']}ms p95={summary['p95_ms']}ms (secuencial, incluye red+embedding) -> {args.out}")


def compare(args) -> None:
    approx = json.loads(args.approx.read_text(encoding="utf-8"))
    exact = json.loads(args.exact.read_text(encoding="utf-8"))
    if approx["queries"] != exact["queries"]:
        raise SystemExit("las dos grabaciones no usan las mismas consultas")

    recalls = [
        len(set(a) & set(e)) / len(e)
        for a, e in zip(approx["results"], exact["results"])
        if e
    ]
    print(f"recall@{approx['k']}: {statistics.mean(recalls):.4f} sobre {len(recalls)} consultas")
    print(f"  aprox ({approx['health']}): p50={approx['p50_ms']}ms p95={approx['p95_ms']}ms")
    print(f"  exacto ({exact['health']}): p50={exact['p50_ms']}ms p95={exact['p95_ms']}ms")


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    rec = sub.add_parser("record")
    rec.add_argument("--addr", default="localhost:50051")
    rec.add_argument("--out", type=Path, required=True)
    rec.add_argument("--collection", default="bench")
    rec.add_argument("--documents", type=Path, default=Path("data/generated/documents.jsonl"))
    rec.add_argument("--samples", type=int, default=200)
    rec.add_argument("--k", type=int, default=10)
    rec.add_argument("--seed", type=int, default=7)

    cmp_ = sub.add_parser("compare")
    cmp_.add_argument("approx", type=Path)
    cmp_.add_argument("exact", type=Path)

    args = parser.parse_args()
    record(args) if args.cmd == "record" else compare(args)


if __name__ == "__main__":
    main()
