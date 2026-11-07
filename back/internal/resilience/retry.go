package resilience

import (
	"context"
	"time"

	"neo-api/internal/provider"
)

type retrying struct {
	inner   provider.Provider
	retries int
	backoff time.Duration
}

// WithRetry reintenta hasta `retries` veces con backoff fijo. No reintenta si
// el contexto ya se canceló.
func WithRetry(inner provider.Provider, retries int) provider.Provider {
	if retries <= 0 {
		return inner
	}
	return &retrying{inner: inner, retries: retries, backoff: 200 * time.Millisecond}
}

func (r *retrying) Decide(ctx context.Context, req provider.Request) (provider.Response, error) {
	var lastErr error
	for attempt := 0; attempt <= r.retries; attempt++ {
		resp, err := r.inner.Decide(ctx, req)
		if err == nil {
			return resp, nil
		}
		lastErr = err

		if attempt == r.retries {
			break
		}
		select {
		case <-ctx.Done():
			return provider.Response{}, ctx.Err()
		case <-time.After(r.backoff * time.Duration(attempt+1)):
		}
	}
	return provider.Response{}, lastErr
}
