// Package modelclient llama a neo-model (Python) para fine-tuning. A
// diferencia de provider/local, esto no es intercambiable por Jev: el
// entrenamiento siempre corre en el modelo local.
package modelclient

import (
	"context"
	"fmt"
	"iter"

	"connectrpc.com/connect"

	neov1 "neo-api/internal/genproto/neo/v1"
	"neo-api/internal/genproto/neo/v1/neov1connect"
	"neo-api/internal/grpcconn"
)

type JobEvent struct {
	Step       uint32
	MaxSteps   uint32
	Loss       float64
	ETA        string
	Status     string
	AdapterURI string
	Error      string
}

type Client struct {
	conn neov1connect.ModelServiceClient
}

func New(addr string) *Client {
	httpClient := grpcconn.NewH2CClient()
	conn := neov1connect.NewModelServiceClient(httpClient, grpcconn.BaseURL(addr), connect.WithGRPC())
	return &Client{conn: conn}
}

func (c *Client) StartFineTune(ctx context.Context, baseModel, datasetURI string, hyperparameters map[string]string) (jobID string, err error) {
	resp, err := c.conn.StartFineTune(ctx, connect.NewRequest(&neov1.FineTuneRequest{
		BaseModel:       baseModel,
		DatasetUri:      datasetURI,
		Hyperparameters: hyperparameters,
	}))
	if err != nil {
		return "", fmt.Errorf("neo-model StartFineTune: %w", err)
	}
	return resp.Msg.JobId, nil
}

// WatchJob reenvía el progreso del fine-tuning. El llamador recorre el
// iterador hasta que termine o el contexto se cancele.
func (c *Client) WatchJob(ctx context.Context, jobID string) iter.Seq2[JobEvent, error] {
	return func(yield func(JobEvent, error) bool) {
		stream, err := c.conn.WatchJob(ctx, connect.NewRequest(&neov1.JobRef{JobId: jobID}))
		if err != nil {
			yield(JobEvent{}, fmt.Errorf("neo-model WatchJob: %w", err))
			return
		}
		for stream.Receive() {
			ev := stream.Msg()
			if !yield(JobEvent{
				Step: ev.Step, MaxSteps: ev.MaxSteps, Loss: ev.Loss, ETA: ev.Eta,
				Status: ev.Status, AdapterURI: ev.AdapterUri, Error: ev.Error,
			}, nil) {
				return
			}
		}
		if err := stream.Err(); err != nil {
			yield(JobEvent{}, err)
		}
	}
}

// Health consulta el RPC Health de neo-model (model.proto). Error si no
// responde o si responde ok=false.
func (c *Client) Health(ctx context.Context) error {
	resp, err := c.conn.Health(ctx, connect.NewRequest(&neov1.ModelHealthRequest{}))
	if err != nil {
		return fmt.Errorf("neo-model Health: %w", err)
	}
	if !resp.Msg.GetOk() {
		return fmt.Errorf("neo-model no está listo: %s", resp.Msg.GetDetail())
	}
	return nil
}
