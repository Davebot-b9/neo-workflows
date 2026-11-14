//! Embeddings con intfloat/multilingual-e5-small vía fastembed-rs (ONNX
//! Runtime, CPU). e5 es asimétrico: documentos llevan el prefijo "passage: "
//! y consultas "query: " — sin eso el recall cae notablemente.
//!
//! fastembed::TextEmbedding::embed() es síncrono y &mut self: antes un solo
//! modelo tras un Mutex serializaba todas las búsquedas (el cuello de botella
//! medido en la Fase 1 y la Fase 4). Ahora hay un pool de N instancias, cada
//! una con su parte de los núcleos, y se llama dentro de spawn_blocking para
//! no bloquear el runtime de tokio (es trabajo de CPU, no I/O).

mod pool;

use std::sync::Arc;

use fastembed::{EmbeddingModel, TextEmbedding, TextInitOptions};

use pool::Pool;

pub const DIMENSIONS: usize = 384;

pub struct Embedder {
    pool: Arc<Pool<TextEmbedding>>,
    size: usize,
}

impl Embedder {
    /// `size` instancias del modelo; los núcleos disponibles se reparten entre
    /// ellas (una instancia con todos los núcleos no gana nada embebiendo una
    /// sola consulta corta, y varias no se estorban entre sí).
    pub fn new(size: usize) -> anyhow::Result<Self> {
        let size = size.max(1);
        let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
        let threads_each = (cores / size).max(1);

        let mut models = Vec::with_capacity(size);
        for _ in 0..size {
            models.push(TextEmbedding::try_new(
                TextInitOptions::new(EmbeddingModel::MultilingualE5Small)
                    .with_intra_threads(threads_each)
                    .with_show_download_progress(true),
            )?);
        }
        Ok(Self {
            pool: Arc::new(Pool::new(models)),
            size,
        })
    }

    pub fn size(&self) -> usize {
        self.size
    }

    /// Embebe documentos (precedentes a indexar). Normaliza a L2 para que el
    /// índice pueda usar producto interno como similitud coseno.
    pub async fn embed_passages(&self, texts: Vec<String>) -> anyhow::Result<Vec<Vec<f32>>> {
        self.embed_prefixed(texts, "passage: ").await
    }

    /// Embebe una consulta de búsqueda.
    pub async fn embed_query(&self, text: String) -> anyhow::Result<Vec<f32>> {
        let mut out = self.embed_prefixed(vec![text], "query: ").await?;
        out.pop().ok_or_else(|| anyhow::anyhow!("embed_query: sin resultado"))
    }

    async fn embed_prefixed(&self, texts: Vec<String>, prefix: &str) -> anyhow::Result<Vec<Vec<f32>>> {
        let prefixed: Vec<String> = texts.into_iter().map(|t| format!("{prefix}{t}")).collect();
        let mut model = self.pool.checkout().await?;
        tokio::task::spawn_blocking(move || {
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
