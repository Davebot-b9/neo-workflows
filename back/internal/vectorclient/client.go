// Package vectorclient llama a neo-vector (Rust) por gRPC. Solo hay una
// implementación real, así que no necesita Strategy: es un cliente directo.
package vectorclient

import (
	"context"
	"fmt"

	"connectrpc.com/connect"

	neov1 "neo-api/internal/genproto/neo/v1"
	"neo-api/internal/genproto/neo/v1/neov1connect"
	"neo-api/internal/grpcconn"
)

type Match struct {
	ID       uint64
	Score    float32
	Text     string
	Metadata map[string]string
}

type Client struct {
	conn neov1connect.VectorServiceClient
}

func New(addr string) *Client {
	httpClient := grpcconn.NewH2CClient()
	conn := neov1connect.NewVectorServiceClient(httpClient, grpcconn.BaseURL(addr), connect.WithGRPC())
	return &Client{conn: conn}
}

func (c *Client) Search(ctx context.Context, collection, queryText string, topK uint32) ([]Match, error) {
	resp, err := c.conn.Search(ctx, connect.NewRequest(&neov1.SearchRequest{
		Collection: collection,
		QueryText:  queryText,
		TopK:       topK,
	}))
	if err != nil {
		return nil, fmt.Errorf("neo-vector Search: %w", err)
	}

	matches := make([]Match, 0, len(resp.Msg.Matches))
	for _, m := range resp.Msg.Matches {
		matches = append(matches, Match{ID: m.Id, Score: m.Score, Text: m.Text, Metadata: m.Metadata})
	}
	return matches, nil
}

// Health consulta el RPC Health de neo-vector (vector.proto). Error si no
// responde o si responde ok=false.
func (c *Client) Health(ctx context.Context) error {
	resp, err := c.conn.Health(ctx, connect.NewRequest(&neov1.HealthRequest{}))
	if err != nil {
		return fmt.Errorf("neo-vector Health: %w", err)
	}
	if !resp.Msg.GetOk() {
		return fmt.Errorf("neo-vector no está listo: %s", resp.Msg.GetDetail())
	}
	return nil
}
