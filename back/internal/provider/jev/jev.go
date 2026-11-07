// Package jev es el Adapter para TypeSafe: traduce entre provider.Provider y
// el JSON de la API System One por HTTPS.
//
// El wire JSON de abajo está verificado contra el código fuente de qev
// (schema.py de github.com/OmniJev/OneJev), que dice seguir el OpenAPI
// público de TypeSafe y está comprobado contra respuestas reales de Jev
// (ver CLAUDE.md). No es una suposición: choice/score/noul tienen formas
// distintas, y criteria cambia de tipo según la pregunta (mapa, lista u
// objeto anidado), por eso el request se arma como map[string]any en vez de
// un struct fijo.
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

func (a *Adapter) Decide(ctx context.Context, req provider.Request) (provider.Response, error) {
	questions := make(map[string]any, len(req.Questions))
	for name, q := range req.Questions {
		questions[name] = wireQuestion(q)
	}

	body, err := json.Marshal(map[string]any{
		"model":     req.Model,
		"state":     req.State,
		"questions": questions,
	})
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
	for name, raw := range wire.Answers {
		ans, err := parseWireAnswer(raw)
		if err != nil {
			return provider.Response{}, fmt.Errorf("jev: pregunta %q: %w", name, err)
		}
		answers[name] = ans
	}

	return provider.Response{
		Model:   wire.Model,
		Answers: answers,
		Usage:   provider.Usage{InputTokens: wire.Usage.InputTokens, OutputTokens: wire.Usage.OutputTokens},
	}, nil
}

// wireQuestion arma el JSON de una pregunta según su type: choice usa un
// mapa, score una lista ordenada, noul un objeto {true, false} opcional.
func wireQuestion(q provider.Question) map[string]any {
	out := map[string]any{"type": q.Type, "instructions": q.Instructions}
	switch q.Type {
	case "choice":
		out["criteria"] = q.Criteria
	case "score":
		out["criteria"] = q.ScoreLevels
	case "noul":
		if q.NoulTrue != "" || q.NoulFalse != "" {
			criteria := map[string]string{}
			if q.NoulTrue != "" {
				criteria["true"] = q.NoulTrue
			}
			if q.NoulFalse != "" {
				criteria["false"] = q.NoulFalse
			}
			out["criteria"] = criteria
		}
	}
	return out
}

type wireResponse struct {
	Model   string                     `json:"model"`
	Answers map[string]json.RawMessage `json:"answers"`
	Usage   wireUsage                  `json:"usage"`
}

type wireUsage struct {
	InputTokens  uint32 `json:"input_tokens"`
	OutputTokens uint32 `json:"output_tokens"`
}

type wireAnswerType struct {
	Type string `json:"type"`
}

func parseWireAnswer(raw json.RawMessage) (provider.Answer, error) {
	var probe wireAnswerType
	if err := json.Unmarshal(raw, &probe); err != nil {
		return provider.Answer{}, fmt.Errorf("decodificando type: %w", err)
	}

	switch probe.Type {
	case "noul":
		var w struct {
			Noul float64 `json:"noul"`
		}
		if err := json.Unmarshal(raw, &w); err != nil {
			return provider.Answer{}, err
		}
		return provider.Answer{Type: "noul", Noul: w.Noul}, nil

	case "choice":
		var w struct {
			Choice        string             `json:"choice"`
			Probabilities map[string]float64 `json:"probabilities"`
			Confidence    float64            `json:"confidence"`
		}
		if err := json.Unmarshal(raw, &w); err != nil {
			return provider.Answer{}, err
		}
		return provider.Answer{
			Type: "choice", Choice: w.Choice, Probabilities: w.Probabilities, Confidence: w.Confidence,
		}, nil

	case "score":
		var w struct {
			Score         float64            `json:"score"`
			Legend        map[string]string  `json:"legend"`
			Probabilities map[string]float64 `json:"probabilities"`
			Confidence    float64            `json:"confidence"`
		}
		if err := json.Unmarshal(raw, &w); err != nil {
			return provider.Answer{}, err
		}
		return provider.Answer{
			Type: "score", Score: w.Score, Legend: w.Legend, Probabilities: w.Probabilities, Confidence: w.Confidence,
		}, nil

	default:
		return provider.Answer{}, fmt.Errorf("type de respuesta desconocido: %q", probe.Type)
	}
}
