// Package jev es el Adapter para TypeSafe: traduce entre provider.Provider y
// el JSON de la API System One por HTTPS.
//
// TODO (bloqueante antes de usarlo con Oscar): confirmar contra
// docs.typesafe.ai los campos exactos del body, en especial para
// preguntas "choice" y "score" (ver Contratos en el brief). Esta
// implementación asume los mismos nombres que el proto interno.
package jev

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"neo-api/internal/provider"
)

const DefaultBaseURL = "https://api.typesafe.ai"

type Adapter struct {
	httpClient *http.Client
	baseURL    string
	apiKey     string
}

func New(baseURL, apiKey string) *Adapter {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	return &Adapter{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		baseURL:    baseURL,
		apiKey:     apiKey,
	}
}

type wireQuestion struct {
	Type         string            `json:"type"`
	Instructions string            `json:"instructions"`
	Criteria     map[string]string `json:"criteria,omitempty"`
}

type wireRequest struct {
	Model     string                  `json:"model"`
	State     string                  `json:"state"`
	Questions map[string]wireQuestion `json:"questions"`
}

type wireAnswer struct {
	Probabilities map[string]float64 `json:"probabilities"`
	Confidence    float64             `json:"confidence"`
}

type wireUsage struct {
	PromptTokens     uint32 `json:"prompt_tokens"`
	CompletionTokens uint32 `json:"completion_tokens"`
	LatencyMs        uint32 `json:"latency_ms"`
}

type wireResponse struct {
	Model   string                `json:"model"`
	Answers map[string]wireAnswer `json:"answers"`
	Usage   wireUsage             `json:"usage"`
}

func (a *Adapter) Decide(ctx context.Context, req provider.Request) (provider.Response, error) {
	questions := make(map[string]wireQuestion, len(req.Questions))
	for name, q := range req.Questions {
		questions[name] = wireQuestion{Type: q.Type, Instructions: q.Instructions, Criteria: q.Criteria}
	}

	body, err := json.Marshal(wireRequest{Model: req.Model, State: req.State, Questions: questions})
	if err != nil {
		return provider.Response{}, fmt.Errorf("jev: codificando request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL+"/v1/systemone", bytes.NewReader(body))
	if err != nil {
		return provider.Response{}, fmt.Errorf("jev: armando request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+a.apiKey)

	httpResp, err := a.httpClient.Do(httpReq)
	if err != nil {
		return provider.Response{}, fmt.Errorf("jev: llamando a %s: %w", a.baseURL, err)
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode != http.StatusOK {
		return provider.Response{}, fmt.Errorf("jev: status %d", httpResp.StatusCode)
	}

	var wire wireResponse
	if err := json.NewDecoder(httpResp.Body).Decode(&wire); err != nil {
		return provider.Response{}, fmt.Errorf("jev: decodificando response: %w", err)
	}

	answers := make(map[string]provider.Answer, len(wire.Answers))
	for name, a := range wire.Answers {
		answers[name] = provider.Answer{Probabilities: a.Probabilities, Confidence: a.Confidence}
	}

	return provider.Response{
		Model:   wire.Model,
		Answers: answers,
		Usage: provider.Usage{
			PromptTokens:     wire.Usage.PromptTokens,
			CompletionTokens: wire.Usage.CompletionTokens,
			LatencyMs:        wire.Usage.LatencyMs,
		},
	}, nil
}
