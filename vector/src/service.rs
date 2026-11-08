//! Fase 1: embeddings y búsqueda real. Upsert embebe los documentos que no
//! traigan vector ya calculado; Search embebe query_text si no viene
//! query_vector. Nunca decide nada de negocio, solo devuelve vecinos con
//! score (ver Reglas en el brief).

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use tonic::{Request, Response, Status};
use tracing::Instrument;
use tracing_opentelemetry::OpenTelemetrySpanExt;

use crate::embed::Embedder;
use crate::index::VectorIndex;
use crate::neov1::vector_service_server::VectorService;
use crate::neov1::{
    HealthRequest, HealthResponse, Match, SearchRequest, SearchResponse, UpsertRequest,
    UpsertResponse,
};
use crate::otel::extract_parent_context;

#[derive(Clone)]
struct DocMeta {
    text: String,
    metadata: HashMap<String, String>,
}

// VectorIndex solo sabe de vectores (ver el trait); el texto y los metadatos
// son responsabilidad del servicio, no del índice.
pub struct VectorServiceImpl {
    embedder: Arc<Embedder>,
    index: Arc<dyn VectorIndex>,
    docs: RwLock<HashMap<u64, DocMeta>>,
}

impl VectorServiceImpl {
    pub fn new(embedder: Arc<Embedder>, index: Arc<dyn VectorIndex>) -> Self {
        Self {
            embedder,
            index,
            docs: RwLock::new(HashMap::new()),
        }
    }
}

#[tonic::async_trait]
impl VectorService for VectorServiceImpl {
    async fn upsert(
        &self,
        request: Request<UpsertRequest>,
    ) -> Result<Response<UpsertResponse>, Status> {
        let parent_cx = extract_parent_context(request.metadata());
        let span = tracing::info_span!("neo-vector.upsert");
        let _ = span.set_parent(parent_cx);

        async move {
            let req = request.into_inner();

            // Documentos sin vector precalculado: se embeben en un solo batch
            // (fastembed es mucho más eficiente por lotes que uno por uno).
            let to_embed: Vec<String> = req
                .documents
                .iter()
                .filter(|d| d.vector.is_empty())
                .map(|d| d.text.clone())
                .collect();
            let mut computed = self
                .embedder
                .embed_passages(to_embed)
                .await
                .map_err(|e| Status::internal(format!("embeddings: {e}")))?
                .into_iter();

            let mut upserted: u64 = 0;
            let mut docs = self.docs.write().unwrap();
            for doc in &req.documents {
                let vector: Vec<f32> = if doc.vector.is_empty() {
                    computed.next().ok_or_else(|| {
                        Status::internal("embeddings: faltaron vectores calculados")
                    })?
                } else {
                    doc.vector.clone()
                };

                self.index
                    .upsert(doc.id, &vector)
                    .map_err(|e| Status::internal(format!("índice: {e}")))?;
                docs.insert(
                    doc.id,
                    DocMeta {
                        text: doc.text.clone(),
                        metadata: doc.metadata.clone(),
                    },
                );
                upserted += 1;
            }

            Ok(Response::new(UpsertResponse { upserted }))
        }
        .instrument(span)
        .await
    }

    async fn search(
        &self,
        request: Request<SearchRequest>,
    ) -> Result<Response<SearchResponse>, Status> {
        let parent_cx = extract_parent_context(request.metadata());
        let span = tracing::info_span!("neo-vector.search");
        let _ = span.set_parent(parent_cx);

        async move {
            let req = request.into_inner();
            let top_k = if req.top_k == 0 { 5 } else { req.top_k };

            let query_vector = if !req.query_vector.is_empty() {
                req.query_vector
            } else if !req.query_text.is_empty() {
                self.embedder
                    .embed_query(req.query_text)
                    .await
                    .map_err(|e| Status::internal(format!("embeddings: {e}")))?
            } else {
                return Err(Status::invalid_argument(
                    "search necesita query_vector o query_text",
                ));
            };

            let results = self
                .index
                .search(&query_vector, top_k as usize)
                .map_err(|e| Status::internal(format!("índice: {e}")))?;

            let docs = self.docs.read().unwrap();
            let matches = results
                .into_iter()
                .map(|(id, score)| {
                    let (text, metadata) = docs
                        .get(&id)
                        .map(|d| (d.text.clone(), d.metadata.clone()))
                        .unwrap_or_default();
                    Match {
                        id,
                        score,
                        text,
                        metadata,
                    }
                })
                .collect();

            Ok(Response::new(SearchResponse { matches }))
        }
        .instrument(span)
        .await
    }

    async fn health(
        &self,
        request: Request<HealthRequest>,
    ) -> Result<Response<HealthResponse>, Status> {
        let parent_cx = extract_parent_context(request.metadata());
        let span = tracing::info_span!("neo-vector.health");
        let _ = span.set_parent(parent_cx);

        async move {
            Ok(Response::new(HealthResponse {
                ok: true,
                detail: format!("fase-1, {} vectores indexados", self.index.len()),
            }))
        }
        .instrument(span)
        .await
    }
}
