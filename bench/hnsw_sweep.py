"""Barrido de parámetros HNSW de usearch fuera de neo-vector.

Recargar el millón en neo-vector cuesta 1.7 h por prueba (el embedding en
CPU domina). Aquí se embebe una sola vez en GPU con el mismo modelo
(intfloat/multilingual-e5-small, prefijos "passage: "/"query: ", pooling
promedio y norma L2, como fastembed) y se prueban índices con el mismo
motor (usearch, binding de Python de la misma versión que el crate) contra
la verdad exacta calculada en GPU. Sirve para elegir parámetros; la medida
que cuenta es la del servicio real (bench/record_topk.py).

    python bench/hnsw_sweep.py embed --out data/generated/embeddings_1m.npy
    python bench/hnsw_sweep.py sweep --emb data/generated/embeddings_1m.npy
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from measure_recall import sample_queries  # noqa: E402

MODEL = "intfloat/multilingual-e5-small"


def load_model():
    import torch
    from transformers import AutoModel, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModel.from_pretrained(MODEL, dtype=torch.float16).cuda().eval()
    return torch, tok, model


def encode(torch, tok, model, texts: list[str], batch: int = 512) -> np.ndarray:
    out = []
    with torch.inference_mode():
        for i in range(0, len(texts), batch):
            enc = tok(texts[i : i + batch], padding=True, truncation=True, max_length=512, return_tensors="pt").to("cuda")
            hidden = model(**enc).last_hidden_state
            mask = enc["attention_mask"].unsqueeze(-1).to(hidden.dtype)
            pooled = (hidden * mask).sum(1) / mask.sum(1)
            pooled = torch.nn.functional.normalize(pooled.float(), dim=-1)
            out.append(pooled.cpu().numpy())
    return np.concatenate(out)


def embed(args) -> None:
    torch, tok, model = load_model()
    ids, texts = [], []
    with args.documents.open(encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            ids.append(d["id"])
            texts.append("passage: " + d["text"])
    start = time.perf_counter()
    vectors = encode(torch, tok, model, texts)
    print(f"{len(texts)} documentos en {time.perf_counter() - start:.0f}s")
    np.save(args.out, vectors)
    np.save(args.out.with_suffix(".ids.npy"), np.asarray(ids, dtype=np.uint64))

    queries = sample_queries(args.documents, args.samples, args.seed)
    np.save(args.out.with_suffix(".queries.npy"), encode(torch, tok, model, ["query: " + q for q in queries]))


def sweep(args) -> None:
    import torch
    from usearch.index import Index

    vectors = np.load(args.emb, mmap_mode="r")
    keys = np.load(args.emb.with_suffix(".ids.npy"))
    queries = np.load(args.emb.with_suffix(".queries.npy"))
    k = args.k

    # Verdad exacta en GPU (producto punto sobre vectores unitarios), por bloques.
    q = torch.from_numpy(queries).cuda()
    best_s = torch.full((len(queries), k), -2.0, device="cuda")
    best_i = torch.zeros((len(queries), k), dtype=torch.long, device="cuda")
    for start in range(0, len(vectors), 200_000):
        block = torch.from_numpy(np.ascontiguousarray(vectors[start : start + 200_000])).cuda()
        s, i = (q @ block.T).topk(k, dim=1)
        merged_s = torch.cat([best_s, s], 1)
        merged_i = torch.cat([best_i, i + start], 1)
        best_s, order = merged_s.topk(k, dim=1)
        best_i = merged_i.gather(1, order)
        del block
    exact = [set(keys[row].tolist()) for row in best_i.cpu().numpy()]
    del q, best_s, best_i
    torch.cuda.empty_cache()

    for conn, exp_add in [tuple(map(int, c.split("/"))) for c in args.configs]:
        index = Index(ndim=vectors.shape[1], metric="ip", dtype="f32",
                      connectivity=conn, expansion_add=exp_add, expansion_search=64)
        start = time.perf_counter()
        for s in range(0, len(vectors), 100_000):
            index.add(keys[s : s + 100_000], np.ascontiguousarray(vectors[s : s + 100_000]))
        build_s = time.perf_counter() - start
        mem_mb = index.memory_usage / 2**20
        for exp_search in args.expansion_search:
            index.expansion_search = exp_search
            start = time.perf_counter()
            found = [index.search(qv, k).keys for qv in queries]  # una por una, como el servicio
            per_query_ms = (time.perf_counter() - start) * 1000 / len(queries)
            recall = np.mean([len(set(f.tolist()) & e) / k for f, e in zip(found, exact)])
            print(f"connectivity={conn:3d} expansion_add={exp_add:4d} expansion_search={exp_search:5d} "
                  f"recall@{k}={recall:.4f} búsqueda={per_query_ms:.2f}ms construcción={build_s:.0f}s índice={mem_mb:.0f}MB",
                  flush=True)
        del index


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    emb = sub.add_parser("embed")
    emb.add_argument("--documents", type=Path, default=Path("data/generated/documents.jsonl"))
    emb.add_argument("--out", type=Path, required=True)
    emb.add_argument("--samples", type=int, default=200)
    emb.add_argument("--seed", type=int, default=7)

    sw = sub.add_parser("sweep")
    sw.add_argument("--emb", type=Path, required=True)
    sw.add_argument("--k", type=int, default=10)
    sw.add_argument("--configs", nargs="+", default=["16/128", "32/256"],
                    help="connectivity/expansion_add")
    sw.add_argument("--expansion-search", type=int, nargs="+", default=[64, 128, 256, 512, 1024])

    args = parser.parse_args()
    embed(args) if args.cmd == "embed" else sweep(args)


if __name__ == "__main__":
    main()
