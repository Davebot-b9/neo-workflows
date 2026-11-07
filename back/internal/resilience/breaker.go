package resilience

import (
	"context"
	"errors"
	"sync"
	"time"

	"neo-api/internal/provider"
)

var ErrBreakerOpen = errors.New("resilience: circuito abierto")

type breaker struct {
	inner            provider.Provider
	failureThreshold int
	cooldown         time.Duration

	mu              sync.Mutex
	consecutiveFail int
	openUntil       time.Time
}

// WithBreaker abre el circuito tras failureThreshold fallos seguidos y lo
// mantiene abierto durante cooldown, sin seguir golpeando un proveedor caído.
func WithBreaker(inner provider.Provider) provider.Provider {
	return &breaker{inner: inner, failureThreshold: 5, cooldown: 10 * time.Second}
}

func (b *breaker) Decide(ctx context.Context, req provider.Request) (provider.Response, error) {
	b.mu.Lock()
	if time.Now().Before(b.openUntil) {
		b.mu.Unlock()
		return provider.Response{}, ErrBreakerOpen
	}
	b.mu.Unlock()

	resp, err := b.inner.Decide(ctx, req)

	b.mu.Lock()
	defer b.mu.Unlock()
	if err != nil {
		b.consecutiveFail++
		if b.consecutiveFail >= b.failureThreshold {
			b.openUntil = time.Now().Add(b.cooldown)
		}
		return provider.Response{}, err
	}
	b.consecutiveFail = 0
	return resp, nil
}
