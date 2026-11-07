//! neo-vector: solo embeddings, índice ANN y búsqueda. Nunca decide nada de
//! negocio (eso vive en neo-api, Go).

mod embed;
mod index;
mod service;

pub mod neov1 {
    tonic::include_proto!("neo.v1");
}

use std::sync::Arc;

use tonic::transport::Server;
use tracing_subscriber::EnvFilter;

use embed::Embedder;
use index::bruteforce::BruteForceIndex;
use index::usearch_index::UsearchIndex;
use index::VectorIndex;
use neov1::vector_service_server::VectorServiceServer;
use service::VectorServiceImpl;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    let addr = std::env::var("NEO_VECTOR_GRPC_ADDR")
        .unwrap_or_else(|_| "[::]:50051".to_string())
        .parse()?;

    tracing::info!("cargando el modelo de embeddings (intfloat/multilingual-e5-small)...");
    let embedder = Arc::new(Embedder::new()?);

    let capacity: usize = std::env::var("NEO_VECTOR_CAPACITY")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(100_000);

    // Fase 1: compara el crate (usearch) contra el índice propio (fuerza
    // bruta); NEO_VECTOR_INDEX_IMPL elige cuál sirve de verdad.
    let index: Arc<dyn VectorIndex> = match std::env::var("NEO_VECTOR_INDEX_IMPL").as_deref() {
        Ok("bruteforce") => {
            tracing::info!("índice: fuerza bruta (propio)");
            Arc::new(BruteForceIndex::default())
        }
        _ => {
            tracing::info!(capacity, "índice: usearch (HNSW)");
            Arc::new(UsearchIndex::new(embed::DIMENSIONS, capacity)?)
        }
    };

    let (health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<VectorServiceServer<VectorServiceImpl>>()
        .await;

    tracing::info!(%addr, "neo-vector escuchando");

    Server::builder()
        .add_service(health_service)
        .add_service(VectorServiceServer::new(VectorServiceImpl::new(
            embedder, index,
        )))
        .serve_with_shutdown(addr, shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
