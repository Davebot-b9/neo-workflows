//! Adapter sobre el crate `usearch` (HNSW). Los vectores deben llegar
//! normalizados (ver embed::normalize); con MetricKind::IP eso da similitud
//! coseno sin pagar la división en cada comparación.

use usearch::{new_index, Index, IndexOptions, MetricKind, ScalarKind};

use super::VectorIndex;

// `Index` ya es Send + Sync (lo declara el propio crate usearch: el índice
// HNSW de abajo soporta lecturas y escrituras concurrentes), así que
// UsearchIndex lo hereda automáticamente sin necesidad de unsafe impl propio.
pub struct UsearchIndex {
    inner: Index,
}

impl UsearchIndex {
    pub fn new(dimensions: usize, capacity: usize) -> anyhow::Result<Self> {
        let options = IndexOptions {
            dimensions,
            metric: MetricKind::IP,
            quantization: ScalarKind::F32,
            connectivity: 0,
            expansion_add: 0,
            expansion_search: 0,
            multi: false, // una sola entrada por key: upsert reemplaza, no apila
        };
        let inner = new_index(&options).map_err(|e| anyhow::anyhow!("usearch: {e}"))?;
        inner
            .reserve(capacity.max(1))
            .map_err(|e| anyhow::anyhow!("usearch reserve: {e}"))?;
        Ok(Self { inner })
    }
}

impl VectorIndex for UsearchIndex {
    fn upsert(&self, id: u64, vector: &[f32]) -> anyhow::Result<()> {
        if self.inner.contains(id) {
            self.inner
                .remove(id)
                .map_err(|e| anyhow::anyhow!("usearch remove: {e}"))?;
        }
        self.inner
            .add(id, vector)
            .map_err(|e| anyhow::anyhow!("usearch add: {e}"))?;
        Ok(())
    }

    fn search(&self, query: &[f32], k: usize) -> anyhow::Result<Vec<(u64, f32)>> {
        let matches = self
            .inner
            .search(query, k)
            .map_err(|e| anyhow::anyhow!("usearch search: {e}"))?;
        Ok(matches
            .keys
            .into_iter()
            .zip(matches.distances)
            .map(|(id, dist)| (id, 1.0 - dist)) // IP sobre vectores unitarios: distancia -> similitud coseno
            .collect())
    }

    fn len(&self) -> usize {
        self.inner.size()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn normalized(v: [f32; 2]) -> [f32; 2] {
        let norm = (v[0] * v[0] + v[1] * v[1]).sqrt();
        [v[0] / norm, v[1] / norm]
    }

    #[test]
    fn search_finds_nearest_neighbor() {
        let index = UsearchIndex::new(2, 10).unwrap();
        index.upsert(1, &normalized([1.0, 0.0])).unwrap();
        index.upsert(2, &normalized([0.0, 1.0])).unwrap();
        index.upsert(3, &normalized([0.9, 0.1])).unwrap();

        let results = index.search(&normalized([1.0, 0.0]), 2).unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].0, 1);
    }

    #[test]
    fn upsert_is_idempotent_for_same_id() {
        let index = UsearchIndex::new(2, 10).unwrap();
        index.upsert(1, &normalized([1.0, 0.0])).unwrap();
        index.upsert(1, &normalized([1.0, 0.0])).unwrap();
        assert_eq!(index.len(), 1);
    }
}
