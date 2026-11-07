//! Fase 0: Search devuelve vecinos fijos, sin embeddings ni índice real
//! todavía (eso llega en la Fase 1, ver index/ y embed/).

use tonic::{Request, Response, Status};

use crate::neov1::vector_service_server::VectorService;
use crate::neov1::{
    HealthRequest, HealthResponse, Match, SearchRequest, SearchResponse, UpsertRequest,
    UpsertResponse,
};

#[derive(Default)]
pub struct VectorServiceImpl;

#[tonic::async_trait]
impl VectorService for VectorServiceImpl {
    async fn upsert(
        &self,
        request: Request<UpsertRequest>,
    ) -> Result<Response<UpsertResponse>, Status> {
        let req = request.into_inner();
        Ok(Response::new(UpsertResponse {
            upserted: req.documents.len() as u64,
        }))
    }

    async fn search(
        &self,
        request: Request<SearchRequest>,
    ) -> Result<Response<SearchResponse>, Status> {
        let req = request.into_inner();
        let top_k = if req.top_k == 0 { 5 } else { req.top_k };
        Ok(Response::new(SearchResponse {
            matches: fixed_matches(top_k),
        }))
    }

    async fn health(
        &self,
        _request: Request<HealthRequest>,
    ) -> Result<Response<HealthResponse>, Status> {
        Ok(Response::new(HealthResponse {
            ok: true,
            detail: "fase-0-sim".to_string(),
        }))
    }
}

fn fixed_matches(top_k: u32) -> Vec<Match> {
    let fixtures: [(u64, f32, &str); 3] = [
        (1, 0.94, "Precedente simulado: contrato de servicios"),
        (2, 0.88, "Precedente simulado: factura vencida"),
        (3, 0.81, "Precedente simulado: reporte trimestral"),
    ];

    fixtures
        .into_iter()
        .take(top_k as usize)
        .map(|(id, score, text)| Match {
            id,
            score,
            text: text.to_string(),
            metadata: Default::default(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_matches_respects_top_k() {
        assert_eq!(fixed_matches(0).len(), 0);
        assert_eq!(fixed_matches(2).len(), 2);
        assert_eq!(fixed_matches(10).len(), 3); // solo hay 3 fixtures
    }

    #[tokio::test]
    async fn search_defaults_top_k_when_zero() {
        let svc = VectorServiceImpl;
        let resp = svc
            .search(Request::new(SearchRequest {
                collection: "x".into(),
                query_vector: vec![],
                query_text: "hola".into(),
                top_k: 0,
            }))
            .await
            .unwrap();
        assert_eq!(resp.into_inner().matches.len(), 3); // default_top_k=5, pero solo hay 3 fixtures
    }
}
