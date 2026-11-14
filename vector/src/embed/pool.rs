//! Object Pool (aprobado por Oscar, Regla 8): N instancias de algo que no se
//! puede compartir (`TextEmbedding::embed` es `&mut self`), prestadas una a
//! la vez. El semáforo limita cuántos préstamos hay en vuelo, así que pedir
//! una instancia nunca encuentra la pila vacía.

use std::sync::{Arc, Mutex};

use tokio::sync::{OwnedSemaphorePermit, Semaphore};

pub struct Pool<T> {
    idle: Arc<Mutex<Vec<T>>>,
    permits: Arc<Semaphore>,
}

impl<T: Send + 'static> Pool<T> {
    pub fn new(items: Vec<T>) -> Self {
        let n = items.len();
        Self {
            idle: Arc::new(Mutex::new(items)),
            permits: Arc::new(Semaphore::new(n)),
        }
    }

    pub async fn checkout(&self) -> anyhow::Result<Loan<T>> {
        let permit = self.permits.clone().acquire_owned().await?;
        let item = self
            .idle
            .lock()
            .unwrap()
            .pop()
            .ok_or_else(|| anyhow::anyhow!("pool: permiso sin instancia libre"))?;
        Ok(Loan {
            item: Some(item),
            idle: Arc::clone(&self.idle),
            _permit: permit,
        })
    }
}

/// Devuelve la instancia al pool al soltarse, también si el trabajo hizo
/// panic: sin esto, un panic dejaría un permiso sin instancia detrás.
pub struct Loan<T> {
    item: Option<T>,
    idle: Arc<Mutex<Vec<T>>>,
    _permit: OwnedSemaphorePermit,
}

impl<T> std::ops::Deref for Loan<T> {
    type Target = T;
    fn deref(&self) -> &T {
        self.item.as_ref().expect("loan vacío")
    }
}

impl<T> std::ops::DerefMut for Loan<T> {
    fn deref_mut(&mut self) -> &mut T {
        self.item.as_mut().expect("loan vacío")
    }
}

impl<T> Drop for Loan<T> {
    fn drop(&mut self) {
        if let Some(item) = self.item.take() {
            if let Ok(mut idle) = self.idle.lock() {
                idle.push(item);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn never_lends_more_than_pool_size() {
        let pool = Arc::new(Pool::new(vec![0u32, 1, 2]));
        let in_flight = Arc::new(AtomicUsize::new(0));
        let max_seen = Arc::new(AtomicUsize::new(0));

        let mut tasks = Vec::new();
        for _ in 0..30 {
            let (pool, in_flight, max_seen) = (pool.clone(), in_flight.clone(), max_seen.clone());
            tasks.push(tokio::spawn(async move {
                let loan = pool.checkout().await.unwrap();
                let now = in_flight.fetch_add(1, Ordering::SeqCst) + 1;
                max_seen.fetch_max(now, Ordering::SeqCst);
                tokio::task::spawn_blocking(|| std::thread::sleep(std::time::Duration::from_millis(5)))
                    .await
                    .unwrap();
                in_flight.fetch_sub(1, Ordering::SeqCst);
                drop(loan);
            }));
        }
        for t in tasks {
            t.await.unwrap();
        }

        assert_eq!(max_seen.load(Ordering::SeqCst), 3);
        assert_eq!(pool.idle.lock().unwrap().len(), 3);
    }

    #[tokio::test]
    async fn returns_item_after_panic() {
        let pool = Arc::new(Pool::new(vec![7u32]));
        let loan = pool.checkout().await.unwrap();
        let joined = tokio::task::spawn_blocking(move || {
            let _loan = loan;
            panic!("trabajo roto");
        })
        .await;
        assert!(joined.is_err());

        let loan = pool.checkout().await.unwrap();
        assert_eq!(*loan, 7);
    }
}
