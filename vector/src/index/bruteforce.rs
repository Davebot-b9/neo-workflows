//! El índice propio con el que la Fase 1 compara usearch: fuerza bruta
//! (dot product sobre vectores normalizados = similitud coseno) con el
//! escaneo paralelizado por rayon. Es la referencia exacta: también sirve
//! como ground truth para medir recall@10 de usearch en bench/.

use std::collections::HashMap;
use std::sync::RwLock;

use rayon::prelude::*;

use super::VectorIndex;

pub struct BruteForceIndex {
    vectors: RwLock<HashMap<u64, Vec<f32>>>,
}

impl Default for BruteForceIndex {
    fn default() -> Self {
        Self {
            vectors: RwLock::new(HashMap::new()),
        }
    }
}

impl VectorIndex for BruteForceIndex {
    fn upsert(&self, id: u64, vector: &[f32]) -> anyhow::Result<()> {
        self.vectors.write().unwrap().insert(id, vector.to_vec());
        Ok(())
    }

    fn search(&self, query: &[f32], k: usize) -> anyhow::Result<Vec<(u64, f32)>> {
        let vectors = self.vectors.read().unwrap();
        let mut scored: Vec<(u64, f32)> = vectors
            .par_iter()
            .map(|(id, v)| (*id, dot(query, v)))
            .collect();
        scored.sort_unstable_by(|a, b| b.1.total_cmp(&a.1));
        scored.truncate(k);
        Ok(scored)
    }

    fn len(&self) -> usize {
        self.vectors.read().unwrap().len()
    }
}

fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_ranks_by_similarity_descending() {
        let index = BruteForceIndex::default();
        index.upsert(1, &[1.0, 0.0]).unwrap();
        index.upsert(2, &[0.0, 1.0]).unwrap();
        index.upsert(3, &[0.9, 0.1]).unwrap(); // sin normalizar: suficiente para el orden esperado aquí

        let results = index.search(&[1.0, 0.0], 2).unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].0, 1); // match exacto primero
        assert_eq!(results[1].0, 3); // segundo más cercano
    }

    #[test]
    fn upsert_overwrites_existing_id() {
        let index = BruteForceIndex::default();
        index.upsert(1, &[1.0, 0.0]).unwrap();
        index.upsert(1, &[0.0, 1.0]).unwrap();
        assert_eq!(index.len(), 1);

        let results = index.search(&[0.0, 1.0], 1).unwrap();
        assert_eq!(results[0].0, 1);
        assert!((results[0].1 - 1.0).abs() < 1e-6);
    }
}
