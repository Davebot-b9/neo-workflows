//! Embeddings. En espera (ver Patrones en el brief): hay un solo modelo por
//! ahora, así que no hace falta Strategy todavía. La Fase 1 elige entre
//! fastembed-rs y ort, y esta función deja de ser un placeholder.

#![allow(dead_code)]

pub fn embed(_text: &str) -> anyhow::Result<Vec<f32>> {
    anyhow::bail!("embeddings todavía no implementados (Fase 1)")
}
