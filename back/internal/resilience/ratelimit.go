package resilience

import (
	"context"

	"golang.org/x/time/rate"

	"neo-api/internal/provider"
)

type rateLimited struct {
	inner   provider.Provider
	limiter *rate.Limiter
}

// WithRateLimit protege la GPU y los límites de tasa de Jev: nunca deja
// pasar más de rps decisiones por segundo hacia el proveedor envuelto.
func WithRateLimit(inner provider.Provider, rps float64) provider.Provider {
	if rps <= 0 {
		return inner
	}
	return &rateLimited{inner: inner, limiter: rate.NewLimiter(rate.Limit(rps), 1)}
}

func (r *rateLimited) Decide(ctx context.Context, req provider.Request) (provider.Response, error) {
	if err := r.limiter.Wait(ctx); err != nil {
		return provider.Response{}, err
	}
	return r.inner.Decide(ctx, req)
}
