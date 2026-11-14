package grpcconn

import (
	"strings"
	"sync/atomic"
)

// Ring reparte llamadas en round-robin entre réplicas de un servicio
// (aprobado por Oscar, Regla 8). Hace falta del lado del cliente porque
// gRPC mantiene una sola conexión HTTP/2 abierta: el DNS de Docker reparte
// conexiones, no llamadas.
type Ring[T any] struct {
	items []T
	next  atomic.Uint64
}

func NewRing[T any](items []T) *Ring[T] {
	return &Ring[T]{items: items}
}

// Order devuelve todas las réplicas empezando por la que toca: la primera es
// a la que se llama, las demás son el orden en que se reintenta si falla.
func (r *Ring[T]) Order() []T {
	n := len(r.items)
	if n == 0 {
		return nil
	}
	start := int((r.next.Add(1) - 1) % uint64(n))
	out := make([]T, 0, n)
	for i := range n {
		out = append(out, r.items[(start+i)%n])
	}
	return out
}

func (r *Ring[T]) All() []T {
	return r.items
}

// SplitAddrs parte una lista "host:puerto,host:puerto" (NEO_MODEL_ADDR con
// varias réplicas) ignorando espacios y entradas vacías.
func SplitAddrs(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}
