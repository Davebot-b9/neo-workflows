//! Strategy para el índice ANN (ver Patrones en el brief). La Fase 1 compara
//! un crate (usearch) contra un índice propio (fuerza bruta en paralelo, que
//! también sirve como referencia exacta para medir recall@10).

pub mod bruteforce;
pub mod usearch_index;

pub trait VectorIndex: Send + Sync {
    fn upsert(&self, id: u64, vector: &[f32]) -> anyhow::Result<()>;
    fn search(&self, query: &[f32], k: usize) -> anyhow::Result<Vec<(u64, f32)>>;
    fn len(&self) -> usize;
}
