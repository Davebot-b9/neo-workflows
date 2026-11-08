//! Fase 4: trazas distribuidas. Exporta a Jaeger por OTLP/gRPC (igual que
//! neo-api, ver back/internal/otelsetup) y puentea los spans de `tracing`
//! con OpenTelemetry vía tracing-opentelemetry. El contexto entrante
//! (`traceparent` que manda el interceptor otelconnect de neo-api) se
//! extrae a mano de los metadata de tonic en cada RPC — tonic no tiene
//! middleware oficial de OTel todavía.

use opentelemetry::propagation::{Extractor, TextMapPropagator};
use opentelemetry::trace::TracerProvider as _;
use opentelemetry_otlp::SpanExporter;
use opentelemetry_sdk::propagation::TraceContextPropagator;
use opentelemetry_sdk::trace::SdkTracerProvider;
use opentelemetry_sdk::Resource;
use tracing_opentelemetry::OpenTelemetryLayer;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::EnvFilter;

pub fn init(service_name: &str) -> anyhow::Result<SdkTracerProvider> {
    let exporter = SpanExporter::builder().with_tonic().build()?;

    let resource = Resource::builder()
        .with_service_name(service_name.to_string())
        .build();

    let provider = SdkTracerProvider::builder()
        .with_batch_exporter(exporter)
        .with_resource(resource)
        .build();

    let tracer = provider.tracer(service_name.to_string());

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .with(OpenTelemetryLayer::new(tracer))
        .try_init()?;

    opentelemetry::global::set_text_map_propagator(TraceContextPropagator::new());

    Ok(provider)
}

/// Adapta los metadata gRPC de tonic al trait Extractor de OpenTelemetry,
/// para leer el `traceparent` que llega del interceptor otelconnect de Go.
pub struct MetadataExtractor<'a>(pub &'a tonic::metadata::MetadataMap);

impl<'a> Extractor for MetadataExtractor<'a> {
    fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).and_then(|v| v.to_str().ok())
    }

    fn keys(&self) -> Vec<&str> {
        self.0
            .keys()
            .map(|k| match k {
                tonic::metadata::KeyRef::Ascii(k) => k.as_str(),
                tonic::metadata::KeyRef::Binary(k) => k.as_str(),
            })
            .collect()
    }
}

/// Extrae el contexto de traza entrante (si lo hay) de los metadata de una
/// request. Se usa al entrar a cada RPC para que el span de neo-vector
/// cuelgue del span de neo-api en vez de empezar una traza nueva.
pub fn extract_parent_context(metadata: &tonic::metadata::MetadataMap) -> opentelemetry::Context {
    let propagator = TraceContextPropagator::new();
    propagator.extract(&MetadataExtractor(metadata))
}
