"""Prueba de punta a punta del ciclo de fine-tuning: los mismos documentos
del set "hard" por dos workflows idénticos salvo por `adapter`, a través de
neo-api (HTTP) y las réplicas de neo-model, y se compara la categoría
contra la etiqueta. Lee el resultado de la bitácora (GET /api/runs), no del
navegador.

    python bench/adapter_e2e.py --n 60
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path

API = "http://localhost:8080"


def post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        API + path, data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def get(path: str):
    with urllib.request.urlopen(API + path, timeout=10) as resp:
        return json.loads(resp.read())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", type=Path, default=Path("data/generated/documents_hard_test.jsonl"))
    parser.add_argument("--n", type=int, default=60)
    args = parser.parse_args()

    docs = [json.loads(line) for line in args.file.open(encoding="utf-8")][: args.n]
    workflows = ["clasificar-documento", "clasificar-documento-lora"]
    expected: dict[str, tuple[str, str]] = {}

    for d in docs:
        for wf in workflows:
            run_id = post("/api/runs", {"workflow": wf, "text": d["text"]})["run_id"]
            expected[run_id] = (wf, d["category"])
            time.sleep(0.6)  # sin saturar: esto mide calidad, no carga

    deadline = time.time() + 120
    found: dict[str, dict] = {}
    while time.time() < deadline and len(found) < len(expected):
        for rec in get("/api/runs?limit=500"):
            if rec["run_id"] in expected:
                found[rec["run_id"]] = rec
        time.sleep(2)

    for wf in workflows:
        rows = [(found[r], cat) for r, (w, cat) in expected.items() if w == wf and r in found]
        hits = sum(1 for rec, cat in rows if rec["answers"]["categoria"]["choice"] == cat)
        adapters = {rec.get("adapter", "") or "(base)" for rec, _ in rows}
        print(f"{wf:28s} adapter={','.join(adapters):40s} acierto={hits}/{len(rows)} ({hits / max(len(rows), 1):.2%})")
    missing = len(expected) - len(found)
    if missing:
        print(f"{missing} runs no llegaron a la bitácora (error o timeout)")


if __name__ == "__main__":
    main()
