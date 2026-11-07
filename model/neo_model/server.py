"""Servidor gRPC de neo-model. Solo sirve inferencia y entrena; la lógica de
negocio (umbrales, cascada) vive en Go, nunca aquí.
"""

from __future__ import annotations

import os
import sys
import time
from concurrent import futures

import grpc
from grpc_health.v1 import health, health_pb2, health_pb2_grpc

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "genproto"))

from neo.v1 import model_pb2, model_pb2_grpc  # noqa: E402

from neo_model import decide as decide_mod
from neo_model import jobs as jobs_mod


class ModelServiceServicer(model_pb2_grpc.ModelServiceServicer):
    def __init__(self, engine):
        self.engine = engine

    def Decide(self, request, context):
        return decide_mod.decide(self.engine, request)

    def StartFineTune(self, request, context):
        return jobs_mod.start_fine_tune(request)

    def WatchJob(self, request, context):
        yield from jobs_mod.watch_job(request)

    def Health(self, request, context):
        gpu_available = os.environ.get("NEO_MODEL_DEVICE", "cpu") == "cuda"
        return model_pb2.ModelHealthResponse(ok=True, gpu_available=gpu_available, detail=self.engine.info.model_path)


def serve() -> None:
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
