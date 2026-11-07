// Package cascade aplica los umbrales de un workflow: a cuál de los tres
// niveles (auto, llm, revisión) va una decisión según su confianza.
//
// Chain of Responsibility: en espera (ver Patrones en el brief). Tres
// niveles fijos caben en esta función; se reabre si aparecen reglas
// dinámicas.
package cascade

const (
	RouteAuto   = "auto"
	RouteLLM    = "llm"
	RouteReview = "review"
)

func Route(confidence, autoThreshold, llmThreshold float64) string {
	switch {
	case confidence >= autoThreshold:
		return RouteAuto
	case confidence >= llmThreshold:
		return RouteLLM
	default:
		return RouteReview
	}
}
