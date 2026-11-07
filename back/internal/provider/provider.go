// Package provider define el Strategy que hace intercambiables el modelo
// local y Jev detrás de la misma forma System One.
package provider

import (
	"context"
	"math"
)

// Question sigue la forma real del API System One (ver workflow.Question).
type Question struct {
	Type         string
	Instructions string
	Criteria     map[string]string // choice
	ScoreLevels  []string          // score, ordenado
	NoulTrue     string            // noul, opcional
	NoulFalse    string            // noul, opcional
}

type Request struct {
	Model     string
	State     string
	Questions map[string]Question
}

// Answer trae exactamente los campos de su Type ("noul" | "choice" |
// "score"); los demás quedan en su valor cero. noul no trae un Confidence
// propio en el API real: usa EffectiveConfidence para la cascada.
type Answer struct {
	Type   string
	Noul   float64
	Choice string
	Score  float64
	Legend map[string]string

	Probabilities map[string]float64 // choice/score
	Confidence    float64            // choice/score
}

// EffectiveConfidence es la confianza que usa la cascada: la del proveedor
// para choice/score, o para noul la distancia de 0.5 reescalada a [0,1]
// (misma fórmula que TypeSafe usa para choice_confidence con dos opciones).
func (a Answer) EffectiveConfidence() float64 {
	if a.Type == "noul" {
		return math.Abs(2*a.Noul - 1)
	}
	return a.Confidence
}

type Usage struct {
	InputTokens  uint32
	OutputTokens uint32
}

type Response struct {
	Model   string
	Answers map[string]Answer
	Usage   Usage
}

// Provider es la Strategy: una interfaz, varios proveedores (local, jev).
type Provider interface {
	Decide(ctx context.Context, req Request) (Response, error)
}
