"""Fase 4: trazas distribuidas. Exporta a Jaeger por OTLP/gRPC, igual que
neo-api (back/internal/otelsetup) y neo-vector (vector/src/otel.rs).

GrpcInstrumentorServer instala un interceptor que extrae el `traceparent`
entrante (propagado por el interceptor otelconnect de Go) y crea el span
de cada RPC ya parentado, sin tocar el código de los servicers.
"""

from __future__ import annotations

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.grpc import GrpcInstrumentorServer
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


def init(service_name: str) -> None:
    provider = TracerProvider(resource=Resource.create({SERVICE_NAME: service_name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)

    GrpcInstrumentorServer().instrument()
