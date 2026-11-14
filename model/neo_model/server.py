"""Servidor gRPC de neo-model. Solo sirve inferencia y entrena; la lógica de
negocio (umbrales, cascada) vive en Go, nunca aquí.
"""

from __future__ import annotations

import os
import sys
import threading
import time
from concurrent import futures
from pathlib import Path

import grpc
from grpc_health.v1 import health, health_pb2, health_pb2_grpc

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "genproto"))

from neo.v1 import model_pb2, model_pb2_grpc  # noqa: E402

from neo_model import decide as decide_mod
from neo_model import jobs as jobs_mod
from neo_model import otel_setup
from neo_model.adapters import AdapterNotFound, Adapters

# Cuánto espera un Decide a que se libere el modelo de esta réplica antes de
# rendirse: por debajo del runTimeout de 30s de neo-api, para que Go alcance
# a reintentar en otra réplica.
DECIDE_LOCK_TIMEOUT_S = float(os.environ.get("NEO_MODEL_DECIDE_LOCK_TIMEOUT", "20"))


class ModelServiceServicer(model_pb2_grpc.ModelServiceServicer):
    def __init__(self, engine):
        self.engine = engine
        self.adapters = Adapters(engine, jobs_mod.ADAPTERS_DIR)
        # Un fine-tuning muta engine.model in-place (agrega un adaptador LoRA)
        # y lo pone en train(): un Decide() concurrente daría resultados
        # corrompidos. Este lock serializa ambos (ver brief: "durante un
        # fine-tuning, neo-model pausa la inferencia").
        self.engine_lock = threading.Lock()
        self.training = threading.Event()

    def Decide(self, request, context):
        if self.training.is_set():
            context.abort(grpc.StatusCode.UNAVAILABLE, "esta réplica está entrenando un fine-tuning; inferencia en pausa")
        if not self.engine_lock.acquire(timeout=DECIDE_LOCK_TIMEOUT_S):
            context.abort(grpc.StatusCode.UNAVAILABLE, "esta réplica está ocupada; inferencia en pausa")
        try:
            return decide_mod.decide(self.engine, self.adapters, request)
        except AdapterNotFound as exc:
            context.abort(grpc.StatusCode.NOT_FOUND, str(exc))
        finally:
            self.engine_lock.release()

    def StartFineTune(self, request, context):
        return jobs_mod.start_fine_tune(self.engine, self.adapters, self.engine_lock, self.training, request)

    def WatchJob(self, request, context):
        yield from jobs_mod.watch_job(request)

    def Health(self, request, context):
        gpu_available = os.environ.get("NEO_MODEL_DEVICE", "cpu") == "cuda"
        return model_pb2.ModelHealthResponse(
            ok=True,
            gpu_available=gpu_available,
            detail=self.engine.info.model_path,
            training=self.training.is_set(),
        )


def serve() -> None:
    # GrpcInstrumentorServer parchea grpc.server(), así que tiene que
    # instalarse antes de crear el servidor más abajo.
    otel_setup.init("neo-model")

    # El modelo se carga al arrancar, antes de aceptar conexiones (Singleton:
    # se carga una vez y se pasa al servicer, ver Patrones en el brief). gRPC
    # no deja registrar un servicer después de server.start(), así que el
    # puerto no escucha hasta que el modelo está listo; compose.yaml le da un
    # start_period generoso al healthcheck para cubrir esta espera.
    print("cargando el modelo...", flush=True)
    t0 = time.perf_counter()
    engine = decide_mod.load_engine()
    print(f"modelo cargado en {time.perf_counter() - t0:.1f}s: {engine.info.model_path} ({engine.info.device})", flush=True)

    addr = os.environ.get("NEO_MODEL_GRPC_ADDR", "[::]:50052")
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    model_pb2_grpc.add_ModelServiceServicer_to_server(ModelServiceServicer(engine), server)

    health_servicer = health.HealthServicer()
    health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
    health_servicer.set("neo.v1.ModelService", health_pb2.HealthCheckResponse.SERVING)

    server.add_insecure_port(addr)
    server.start()
    print(f"neo-model escuchando en {addr}", flush=True)
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
