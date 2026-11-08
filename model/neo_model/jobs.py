"""Fase 3: fine-tuning LoRA real. start_fine_tune lanza el entrenamiento en
un hilo de fondo (sostiene engine_lock mientras entrena, para pausar Decide
— ver brief: "durante un fine-tuning, neo-model pausa la inferencia") y
publica el progreso en una cola por job; watch_job la drena hasta un evento
terminal (Observer: TrainerCallback-como-callback, no una clase separada,
ver on_progress en train/lora.py).
"""

from __future__ import annotations

import os
import queue
import threading
import uuid
from collections.abc import Iterator
from pathlib import Path

from neo.v1 import model_pb2

from neo_model.train import lora as lora_mod

ADAPTERS_DIR = Path(os.environ.get("NEO_MODEL_ADAPTERS_DIR", "/data/adapters"))
DATASETS_DIR = Path(os.environ.get("NEO_MODEL_DATASETS_DIR", "/datasets"))

_jobs: dict[str, "queue.Queue[model_pb2.JobEvent | None]"] = {}
_jobs_lock = threading.Lock()


def start_fine_tune(engine, engine_lock: threading.Lock, request: model_pb2.FineTuneRequest) -> model_pb2.Job:
    job_id = str(uuid.uuid4())
    q: "queue.Queue[model_pb2.JobEvent | None]" = queue.Queue()
    with _jobs_lock:
        _jobs[job_id] = q

    thread = threading.Thread(target=_run_job, args=(engine, engine_lock, request, job_id, q), daemon=True)
    thread.start()
    return model_pb2.Job(job_id=job_id, status="queued")


def watch_job(request: model_pb2.JobRef) -> Iterator[model_pb2.JobEvent]:
    with _jobs_lock:
        q = _jobs.get(request.job_id)
    if q is None:
        yield model_pb2.JobEvent(job_id=request.job_id, status="error", error="job desconocido")
        return

    while True:
        item = q.get()
        if item is None:
            break
        yield item

    with _jobs_lock:
        _jobs.pop(request.job_id, None)


def _run_job(engine, engine_lock: threading.Lock, request: model_pb2.FineTuneRequest, job_id: str, q) -> None:
    def on_progress(ev: lora_mod.ProgressEvent) -> None:
        q.put(model_pb2.JobEvent(
            job_id=job_id, step=ev.step, max_steps=ev.max_steps, loss=ev.loss,
            eta=f"{ev.eta_seconds:.0f}s", status="progress",
        ))

    try:
        dataset_path = DATASETS_DIR / Path(request.dataset_uri).name
        params = dict(request.hyperparameters)
        with engine_lock:
            adapter_path = lora_mod.run_lora_job(
                engine, dataset_path, ADAPTERS_DIR, job_id,
                epochs=int(params.get("epochs", 3)),
                batch_size=int(params.get("batch_size", 4)),
                lr=float(params.get("lr", 1e-4)),
                lora_r=int(params.get("lora_r", 8)),
                on_progress=on_progress,
            )
        q.put(model_pb2.JobEvent(job_id=job_id, status="done", adapter_uri=str(adapter_path)))
    except Exception as exc:  # un job roto no debe tumbar el servidor
        q.put(model_pb2.JobEvent(job_id=job_id, status="error", error=str(exc)))
    finally:
        q.put(None)
