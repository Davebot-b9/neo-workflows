"""Fase 3: LoRA real sobre OneJev-0.8B.

Usa el mismo renderizado de prompt que qev (qev.prompt) para que el
adaptador entrenado sea compatible con DecisionEngine en inferencia: la
señal de entrenamiento es "predecir la letra correcta como siguiente
token", justo lo que DecisionEngine lee de los logits de los slots (ver
qev/prompt.py — SLOT_LABELS). No es un head custom: es next-token
prediction estándar, por eso un LoRA con `peft` aplica directo, sin
necesitar el pipeline train.sft (full fine-tune multi-GPU) del propio qev.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model
from qev.prompt import SLOT_LABELS, build_messages, render_question
from qev.schema import ChoiceQuestion

CATEGORIA_CRITERIA = {
    "contrato": "Acuerdos entre partes",
    "factura": "Cobros y pagos",
    "reporte": "Informes y resultados",
}
INSTRUCTIONS = "¿A qué categoría pertenece el documento?"


@dataclass
class ProgressEvent:
    step: int
    max_steps: int
    loss: float
    eta_seconds: float


def load_dataset(path: Path) -> list[dict]:
    docs = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            docs.append(json.loads(line))
    return docs


def build_example(tokenizer, text: str, category: str) -> tuple[list[int], list[int]]:
    """Arma (input_ids, labels) con -100 en todo salvo la letra correcta,
    usando exactamente el mismo render_question/build_messages que usa
    DecisionEngine en inferencia (ver qev/prompt.py)."""
    question = ChoiceQuestion(type="choice", instructions=INSTRUCTIONS, criteria=CATEGORIA_CRITERIA)
    rendered = render_question("categoria", question)
    letters = SLOT_LABELS[: len(rendered.labels)]
    target_letter = letters[rendered.labels.index(category)]

    messages = build_messages(f"Documento: {text}", rendered.suffix)
    prompt_text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    full_text = prompt_text + target_letter

    prompt_len = len(tokenizer(prompt_text, add_special_tokens=False)["input_ids"])
    full_ids = tokenizer(full_text, add_special_tokens=False)["input_ids"]
    labels = [-100] * prompt_len + full_ids[prompt_len:]
    return full_ids, labels


def _collate(batch: list[tuple[list[int], list[int]]], pad_id: int):
    max_len = max(len(ids) for ids, _ in batch)
    input_ids, labels, attn = [], [], []
    for ids, lab in batch:
        pad = max_len - len(ids)
        input_ids.append(ids + [pad_id] * pad)
        labels.append(lab + [-100] * pad)
        attn.append([1] * len(ids) + [0] * pad)
    return torch.tensor(input_ids), torch.tensor(labels), torch.tensor(attn)


def run_lora_job(
    engine,
    dataset_path: Path,
    adapters_dir: Path,
    job_id: str,
    epochs: int = 3,
    batch_size: int = 4,
    lr: float = 1e-4,
    lora_r: int = 8,
    on_progress: Callable[[ProgressEvent], None] | None = None,
) -> Path:
    """Llamar solo con engine_lock tomado: muta engine.model in-place
    (pega el adaptador LoRA) y lo pone en train(); correr un Decide() al
    mismo tiempo daría resultados corrompidos (dropout activo, pesos
    cambiando a medio forward). Ver brief: "durante un fine-tuning,
    neo-model pausa la inferencia"."""
    tokenizer = engine.tokenizer
    pad_id = engine.pad_id

    docs = load_dataset(dataset_path)
    examples = [build_example(tokenizer, d["text"], d["category"]) for d in docs]

    lora_config = LoraConfig(
        r=lora_r, lora_alpha=lora_r * 2, lora_dropout=0.05,
        target_modules="all-linear", task_type="CAUSAL_LM",
    )
    model = get_peft_model(engine.model, lora_config)
    model.train()

    optimizer = torch.optim.AdamW((p for p in model.parameters() if p.requires_grad), lr=lr)

    batches = [examples[i : i + batch_size] for i in range(0, len(examples), batch_size)]
    max_steps = epochs * len(batches)
    step = 0
    start = time.perf_counter()

    try:
        for _epoch in range(epochs):
            for batch in batches:
                input_ids, labels, attn = _collate(batch, pad_id)
                input_ids, labels, attn = (t.to(engine.device) for t in (input_ids, labels, attn))

                out = model(input_ids=input_ids, attention_mask=attn, labels=labels)
                loss_value = out.loss.detach().item()
                out.loss.backward()
                torch.nn.utils.clip_grad_norm_((p for p in model.parameters() if p.requires_grad), 1.0)
                optimizer.step()
                optimizer.zero_grad()

                step += 1
                elapsed = time.perf_counter() - start
                eta = elapsed / step * (max_steps - step)
                if on_progress:
                    on_progress(ProgressEvent(step=step, max_steps=max_steps, loss=loss_value, eta_seconds=eta))

        adapters_dir.mkdir(parents=True, exist_ok=True)
        adapter_path = adapters_dir / job_id
        model.save_pretrained(str(adapter_path))
        return adapter_path
    finally:
        # Siempre despegar el adaptador del modelo compartido al salir
        # (éxito o error): Decide() vuelve a ver el modelo base tal cual.
        model.eval()
        engine.model = model.unload()
