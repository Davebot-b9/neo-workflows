// Package local es el Adapter: traduce entre provider.Provider y el gRPC de
// neo-model (Python).
package local

import (
	"context"
	"fmt"

	"connectrpc.com/connect"

	neov1 "neo-api/internal/genproto/neo/v1"
	"neo-api/internal/genproto/neo/v1/neov1connect"
	"neo-api/internal/grpcconn"
	"neo-api/internal/provider"
)

type Adapter struct {
	client neov1connect.ModelServiceClient
}

func New(addr string) *Adapter {
	httpClient := grpcconn.NewH2CClient()
	client := neov1connect.NewModelServiceClient(httpClient, grpcconn.BaseURL(addr), connect.WithGRPC())
	return &Adapter{client: client}
}

func (a *Adapter) Decide(ctx context.Context, req provider.Request) (provider.Response, error) {
	questions := make(map[string]*neov1.Question, len(req.Questions))
	for name, q := range req.Questions {
		questions[name] = &neov1.Question{
			Type:         q.Type,
			Instructions: q.Instructions,
			Criteria:     q.Criteria,
		}
	}

	resp, err := a.client.Decide(ctx, connect.NewRequest(&neov1.DecideRequest{
		Model:     req.Model,
		State:     req.State,
		Questions: questions,
	}))
	if err != nil {
		return provider.Response{}, fmt.Errorf("neo-model Decide: %w", err)
	}

	answers := make(map[string]provider.Answer, len(resp.Msg.Answers))
	for name, a := range resp.Msg.Answers {
		answers[name] = provider.Answer{
			Probabilities: a.Probabilities,
			Confidence:    a.Confidence,
		}
	}

	var usage provider.Usage
	if u := resp.Msg.Usage; u != nil {
		usage = provider.Usage{
			PromptTokens:     u.PromptTokens,
			CompletionTokens: u.CompletionTokens,
			LatencyMs:        u.LatencyMs,
		}
	}

	return provider.Response{Model: resp.Msg.Model, Answers: answers, Usage: usage}, nil
}
