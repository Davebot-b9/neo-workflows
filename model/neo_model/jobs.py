"""Fase 0: fine-tuning simulado. La Fase 3 reemplaza esto por un Trainer real
con LoRA y un ProgressCallback (Observer) publicando por `publish`.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Iterator

from neo.v1 import model_pb2

_SIMULATED_STEPS = 5


def start_fine_tune(request: model_pb2.FineTuneRequest) -> model_pb2.Job:
    job_id = str(uuid.uuid4())
    return model_pb2.Job(job_id=job_id, status="queued")


def watch_job(job_ref: model_pb2.JobRef) -> Iterator[model_pb2.JobEvent]:
    job_id = job_ref.job_id
    loss = 1.8
    for step in range(1, _SIMULATED_STEPS + 1):
        time.sleep(0.2)
        loss = round(loss * 0.85, 4)
        yield model_pb2.JobEvent(
            job_id=job_id,
            step=step,
            max_steps=_SIMULATED_STEPS,
            loss=loss,
            eta=f"{(_SIMULATED_STEPS - step) * 0.2:.1f}s",
            status="progress",
        )

    yield model_pb2.JobEvent(
        job_id=job_id,
        step=_SIMULATED_STEPS,
        max_steps=_SIMULATED_STEPS,
        status="done",
        adapter_uri=f"local://adapters/{job_id}",
    )
