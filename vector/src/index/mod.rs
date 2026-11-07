//! Strategy para el índice ANN (ver Patrones en el brief). La Fase 1 decide
//! entre usearch y hnsw_rs y lo implementa aquí; por ahora es solo el
//! contrato, sin uso todavía.

#![allow(dead_code)]

pub trait VectorIndex: Send + Sync {
    fn upsert(&self, id: u64, vector: &[f32]) -> anyhow::Result<()>;
    fn search(&self, query: &[f32], k: usize) -> anyhow::Result<Vec<(u64, f32)>>;
}
