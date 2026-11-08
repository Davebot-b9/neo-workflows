"""Fase 3: compara concordancia y ECE antes/después de aplicar un
adaptador LoRA, sobre el mismo set de prueba. Corre dentro del contenedor
de neo-model (necesita torch/qev ya cargados), en un proceso aparte del
servidor — cada uno carga su propia instancia del modelo, sin compartir
estado ni el engine_lock del servidor.

Uso (desde el host):
    docker compose exec neo-model python -m neo_model.train.compare_calibration \
        --test /datasets/documents_hard_test.jsonl --adapter /data/adapters/<job_id>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# server.py inserta esto antes de importar neo_model.decide; este script se
# corre aparte (sin pasar por server.py), así que lo hace por su cuenta.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "genproto"))

from peft import PeftModel

from neo.v1 import model_pb2  # noqa: E402
from neo_model import decide as decide_mod  # noqa: E402
from neo_model.train.lora import CATEGORIA_CRITERIA, INSTRUCTIONS  # noqa: E402


def load_docs(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f]


def evaluate(engine, docs: list[dict], bins: int = 10) -> tuple[float, float, int, int]:
    correct = 0
    bin_correct = [0] * bins
    bin_total = [0] * bins
    bin_conf_sum = [0.0] * bins

    for doc in docs:
        req = model_pb2.DecideRequest(
            model="eval",
            state=f"Documento: {doc['text']}",
            questions={
                "categoria": model_pb2.Question(
                    type="choice", instructions=INSTRUCTIONS, choice_criteria=CATEGORIA_CRITERIA,
                )
            },
        )
        resp = decide_mod.decide(engine, req)
        answer = resp.answers["categoria"].choice
        is_correct = answer.choice == doc["category"]
        correct += int(is_correct)

        b = min(int(answer.confidence * bins), bins - 1)
        bin_total[b] += 1
        bin_correct[b] += int(is_correct)
        bin_conf_sum[b] += answer.confidence

    n = len(docs)
    accuracy = correct / n if n else float("nan")
    ece = 0.0
    for b in range(bins):
        if bin_total[b] == 0:
            continue
        acc_b = bin_correct[b] / bin_total[b]
        conf_b = bin_conf_sum[b] / bin_total[b]
        ece += (bin_total[b] / n) * abs(acc_b - conf_b)
    return accuracy, ece, correct, n


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", type=Path, required=True)
    parser.add_argument("--adapter", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=Path("/bench/fase3_calibracion.md"))
    args = parser.parse_args()

    docs = load_docs(args.test)

    print("cargando el modelo base...", flush=True)
    engine = decide_mod.load_engine()

    print("evaluando ANTES del fine-tuning...", flush=True)
    acc_before, ece_before, correct_before, n = evaluate(engine, docs)
    print(f"antes: concordancia={acc_before:.4f} ece={ece_before:.4f}", flush=True)

    print(f"aplicando el adaptador LoRA ({args.adapter})...", flush=True)
    # merge_and_unload (no dejar el wrapper de PeftModel puesto): el
    # DecisionEngine de qev llama self.model.model(...) directo para sacar
    # hidden states (ver qev/engine.py, _run_one), una clase concreta
    # (Qwen3_5ForCausalLM), no la envoltura de PeftModel — con el wrapper
    # puesto, esa misma llamada cae en el forward completo del modelo base
    # (logits, no hidden states) y truena con AttributeError. Fusionar los
    # pesos LoRA deja un modelo plano otra vez, compatible con ese acceso.
    peft_model = PeftModel.from_pretrained(engine.model, str(args.adapter))
    engine.model = peft_model.merge_and_unload()
    engine.model.eval()

    print("evaluando DESPUÉS del fine-tuning...", flush=True)
    acc_after, ece_after, correct_after, _ = evaluate(engine, docs)
    print(f"después: concordancia={acc_after:.4f} ece={ece_after:.4f}", flush=True)

    report = f"""# Fase 3 · Calibración antes/después del fine-tuning LoRA

Adaptador: `{args.adapter}`
Set de prueba: `{args.test}` ({n} documentos, categorías contrato/factura/reporte,
plantillas "hard": a propósito léxicamente ambiguas, sin las palabras que
delatan la categoría — con las plantillas normales el modelo base ya
acierta 100% y no hay margen para medir una mejora real, ver CLAUDE.md).

| Métrica | Antes | Después |
| --- | --- | --- |
| Concordancia | {acc_before:.4f} ({correct_before}/{n}) | {acc_after:.4f} ({correct_after}/{n}) |
| ECE (10 bins) | {ece_before:.4f} | {ece_after:.4f} |
"""
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(report, encoding="utf-8")
    print(f"reporte escrito en {args.out}", flush=True)


if __name__ == "__main__":
    main()
