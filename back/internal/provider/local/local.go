// Package local es el Adapter: traduce entre provider.Provider y el gRPC de
// neo-model (Python).
package local

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	"connectrpc.com/otelconnect"

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
	interceptor, err := otelconnect.NewInterceptor()
	if err != nil {
		panic(fmt.Errorf("provider/local: armando el interceptor de otel: %w", err))
	}
	client := neov1connect.NewModelServiceClient(
		httpClient, grpcconn.BaseURL(addr),
		connect.WithGRPC(), connect.WithInterceptors(interceptor),
	)
	return &Adapter{client: client}
}

func (a *Adapter) Decide(ctx context.Context, req provider.Request) (provider.Response, error) {
	questions := make(map[string]*neov1.Question, len(req.Questions))
	for name, q := range req.Questions {
		questions[name] = &neov1.Question{
			Type:           q.Type,
			Instructions:   q.Instructions,
			ChoiceCriteria: q.Criteria,
			ScoreLevels:    q.ScoreLevels,
			NoulTrue:       q.NoulTrue,
			NoulFalse:      q.NoulFalse,
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
	for name, wireAnswer := range resp.Msg.Answers {
		a, err := fromWireAnswer(wireAnswer)
		if err != nil {
			return provider.Response{}, fmt.Errorf("neo-model Decide: pregunta %q: %w", name, err)
		}
		answers[name] = a
	}

	var usage provider.Usage
	if u := resp.Msg.Usage; u != nil {
		usage = provider.Usage{InputTokens: u.InputTokens, OutputTokens: u.OutputTokens}
	}

	return provider.Response{Model: resp.Msg.Model, Answers: answers, Usage: usage}, nil
}

func fromWireAnswer(wire *neov1.Answer) (provider.Answer, error) {
	switch kind := wire.GetKind().(type) {
	case *neov1.Answer_Noul:
		return provider.Answer{Type: "noul", Noul: kind.Noul.GetNoul()}, nil
	case *neov1.Answer_Choice:
		return provider.Answer{
			Type:          "choice",
			Choice:        kind.Choice.GetChoice(),
			Probabilities: kind.Choice.GetProbabilities(),
			Confidence:    kind.Choice.GetConfidence(),
		}, nil
	case *neov1.Answer_Score:
		return provider.Answer{
			Type:          "score",
			Score:         kind.Score.GetScore(),
			Legend:        kind.Score.GetLegend(),
			Probabilities: kind.Score.GetProbabilities(),
			Confidence:    kind.Score.GetConfidence(),
		}, nil
	default:
		return provider.Answer{}, fmt.Errorf("answer sin kind reconocido")
	}
}
