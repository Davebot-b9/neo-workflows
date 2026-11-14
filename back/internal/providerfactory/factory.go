// Package providerfactory es el Factory: el YAML del workflow elige el
// proveedor (local o jev) y New() entrega un provider.Provider ya envuelto
// con los Decorators de resiliencia. Vive separado de internal/provider para
// no crear un import cycle (los Adapters importan provider; el Factory
// importa los Adapters).
package providerfactory

import (
	"fmt"

	"neo-api/internal/provider"
	"neo-api/internal/provider/jev"
	"neo-api/internal/provider/local"
	"neo-api/internal/resilience"
)

var constructors = map[string]func(provider.Config) (provider.Provider, error){
	"local": func(cfg provider.Config) (provider.Provider, error) {
		if len(cfg.LocalAddrs) == 0 {
			return nil, fmt.Errorf("provider local: falta NEO_MODEL_ADDR")
		}
		return local.New(cfg.LocalAddrs), nil
	},
	"jev": func(cfg provider.Config) (provider.Provider, error) {
		if cfg.JevAPIKey == "" {
			return nil, fmt.Errorf("provider jev: falta JEV_API_KEY")
		}
		return jev.New(cfg.JevBaseURL, cfg.JevAPIKey), nil
	},
}

func New(cfg provider.Config) (provider.Provider, error) {
	mk, ok := constructors[cfg.Kind]
	if !ok {
		return nil, fmt.Errorf("proveedor desconocido: %q", cfg.Kind)
	}
	p, err := mk(cfg)
	if err != nil {
		return nil, err
	}
	// Decorator: misma interfaz, comportamiento añadido de adentro hacia afuera.
	p = resilience.WithBreaker(p)
	p = resilience.WithRateLimit(p, cfg.RPS)
	p = resilience.WithRetry(p, cfg.Retries)
	return p, nil
}

// Available construye, bajo demanda, cada proveedor configurado que de hecho
// pueda arrancar (jev se omite si no hay JEV_API_KEY).
func Available(base provider.Config) (map[string]provider.Provider, error) {
	out := make(map[string]provider.Provider)
	for kind := range constructors {
		cfg := base
		cfg.Kind = kind
		p, err := New(cfg)
		if err != nil {
			if kind == "jev" {
				continue // opcional: se omite sin JEV_API_KEY
			}
			return nil, err
		}
		out[kind] = p
	}
	return out, nil
}
