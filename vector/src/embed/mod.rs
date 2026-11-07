//! Embeddings con intfloat/multilingual-e5-small vía fastembed-rs (ONNX
//! Runtime, CPU). e5 es asimétrico: documentos llevan el prefijo "passage: "
//! y consultas "query: " — sin eso el recall cae notablemente.
//!
//! fastembed::TextEmbedding::embed() es síncrono y &mut self: se protege con
//! un Mutex y se llama dentro de spawn_blocking para no bloquear el runtime
//! de tokio (es trabajo de CPU, no I/O).

use std::sync::Mutex;

use fastembed::{EmbeddingModel, TextEmbedding, TextInitOptions};

pub const DIMENSIONS: usize = 384;

pub struct Embedder {
    model: Mutex<TextEmbedding>,
}

impl Embedder {
    pub fn new() -> anyhow::Result<Self> {
        let model = TextEmbedding::try_new(
            TextInitOptions::new(EmbeddingModel::MultilingualE5Small)
                .with_show_download_progress(true),
        )?;
        Ok(Self {
            model: Mutex::new(model),
        })
    }

    /// Embebe documentos (precedentes a indexar). Normaliza a L2 para que el
    /// índice pueda usar producto interno como similitud coseno.
    pub async fn embed_passages(self: &std::sync::Arc<Self>, texts: Vec<String>) -> anyhow::Result<Vec<Vec<f32>>> {
        self.embed_prefixed(texts, "passage: ").await
    }

    /// Embebe una consulta de búsqueda.
    pub async fn embed_query(self: &std::sync::Arc<Self>, text: String) -> anyhow::Result<Vec<f32>> {
        let mut out = self.embed_prefixed(vec![text], "query: ").await?;
        out.pop().ok_or_else(|| anyhow::anyhow!("embed_query: sin resultado"))
    }

    async fn embed_prefixed(
        self: &std::sync::Arc<Self>,
        texts: Vec<String>,
        prefix: &str,
    ) -> anyhow::Result<Vec<Vec<f32>>> {
        let prefixed: Vec<String> = texts.into_iter().map(|t| format!("{prefix}{t}")).collect();
        let this = std::sync::Arc::clone(self);
        tokio::task::spawn_blocking(move || {
            let mut model = this.model.lock().unwrap();
            let refs: Vec<&str> = prefixed.iter().map(String::as_str).collect();
            let mut embeddings = model
                .embed(refs, None)
                .map_err(|e| anyhow::anyhow!("fastembed: {e}"))?;
            for v in &mut embeddings {
                normalize(v);
            }
            Ok(embeddings)
        })
        .await?
    }
}

fn normalize(v: &mut [f32]) {
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in v.iter_mut() {
            *x /= norm;
        }
    }
}
