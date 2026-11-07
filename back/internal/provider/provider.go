// Package provider define el Strategy que hace intercambiables el modelo
// local y Jev detrás de la misma forma System One.
package provider

import "context"

type Question struct {
	Type         string
	Instructions string
	Criteria     map[string]string
}

type Request struct {
	Model     string
	State     string
	Questions map[string]Question
}

type Answer struct {
	Probabilities map[string]float64
	Confidence    float64
}

type Usage struct {
	PromptTokens     uint32
	CompletionTokens uint32
	LatencyMs        uint32
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
