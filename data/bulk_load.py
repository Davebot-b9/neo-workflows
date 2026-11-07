"""Carga documents.jsonl en un neo-vector corriendo, en lotes, vía
VectorService.Upsert (Rust calcula los embeddings). Usado para poblar el
índice antes de medir p95 de búsqueda y recall@10 (ver bench/).

Uso:
    python data/bulk_load.py --addr localhost:50051 --file data/generated/documents.jsonl --batch-size 256
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import grpc

sys.path.insert(0, str(Path(__file__).parent / "genproto"))

from neo.v1 import vector_pb2, vector_pb2_grpc  # noqa: E402


def batches(path: Path, batch_size: int):
    batch = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            batch.append(json.loads(line))
            if len(batch) == batch_size:
                yield batch
                batch = []
    if batch:
        yield batch


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--addr", default="localhost:50051")
    parser.add_argument("--file", type=Path, default=Path("data/generated/documents.jsonl"))
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--collection", default="bench")
    parser.add_argument("--limit", type=int, default=None, help="cargar solo los primeros N documentos")
    args = parser.parse_args()

    channel = grpc.insecure_channel(args.addr, options=[
        ("grpc.max_send_message_length", 64 * 1024 * 1024),
        ("grpc.max_receive_message_length", 64 * 1024 * 1024),
    ])
    stub = vector_pb2_grpc.VectorServiceStub(channel)

    start = time.perf_counter()
    total = 0
    for batch in batches(args.file, args.batch_size):
        if args.limit is not None and total >= args.limit:
            break
        docs = [
            vector_pb2.Document(id=d["id"], text=d["text"], metadata={"category": d["category"]})
            for d in batch
        ]
        resp = stub.Upsert(
            vector_pb2.UpsertRequest(collection=args.collection, documents=docs),
            timeout=120,
        )
        total += resp.upserted
        if total % 10_000 < args.batch_size:
            elapsed = time.perf_counter() - start
            rate = total / elapsed if elapsed > 0 else 0
            print(f"{total} documentos cargados ({rate:.0f}/s)", flush=True)

    elapsed = time.perf_counter() - start
    print(f"listo: {total} documentos en {elapsed:.1f}s ({total / elapsed:.0f}/s)")


if __name__ == "__main__":
    main()
