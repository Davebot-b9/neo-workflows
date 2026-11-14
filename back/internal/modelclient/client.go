// Package modelclient llama a neo-model (Python) para fine-tuning y salud.
// A diferencia de provider/local, esto no es intercambiable por Jev: el
// entrenamiento siempre corre en el modelo local.
package modelclient

import (
	"context"
	"errors"
	"fmt"
	"iter"
	"sync"

	"connectrpc.com/connect"
	"connectrpc.com/otelconnect"

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

type replica struct {
	addr string
	conn neov1connect.ModelServiceClient
}

type Client struct {
	replicas *grpcconn.Ring[replica]

	// Cada job vive en la réplica que lo empezó (su cola de progreso está en
	// ese proceso de Python): WatchJob tiene que volver a la misma.
	mu   sync.Mutex
	jobs map[string]replica
	// reserved evita que dos StartFineTune concurrentes seleccionen la misma
	// réplica antes de que Python alcance a publicar training=true.
	reserved map[string]bool
	startMu  sync.Mutex
}

func New(addrs []string) *Client {
	httpClient := grpcconn.NewH2CClient()
	interceptor, err := otelconnect.NewInterceptor()
	if err != nil {
		panic(fmt.Errorf("modelclient: armando el interceptor de otel: %w", err))
	}
	reps := make([]replica, 0, len(addrs))
	for _, addr := range addrs {
		reps = append(reps, replica{
			addr: addr,
			conn: neov1connect.NewModelServiceClient(
				httpClient, grpcconn.BaseURL(addr),
				connect.WithGRPC(), connect.WithInterceptors(interceptor),
			),
		})
	}
	return &Client{
		replicas: grpcconn.NewRing(reps),
		jobs:     make(map[string]replica),
		reserved: make(map[string]bool),
	}
}

// StartFineTune elige una réplica que no esté entrenando ya (la que entrena
// pausa su inferencia; las demás siguen atendiendo runs).
func (c *Client) StartFineTune(ctx context.Context, baseModel, datasetURI string, hyperparameters map[string]string) (jobID string, err error) {
	// La selección y reserva son una operación lógica única. La llamada gRPC
	// puede tardar, pero no debemos dejar que otro entrenamiento se cuele en
	// esa ventana.
	c.startMu.Lock()
	defer c.startMu.Unlock()

	target, err := c.pickIdle(ctx)
	if err != nil {
		return "", err
	}
	c.mu.Lock()
	c.reserved[target.addr] = true
	c.mu.Unlock()

	resp, err := target.conn.StartFineTune(ctx, connect.NewRequest(&neov1.FineTuneRequest{
		BaseModel:       baseModel,
		DatasetUri:      datasetURI,
		Hyperparameters: hyperparameters,
	}))
	if err != nil {
		c.release(target.addr)
		return "", fmt.Errorf("neo-model StartFineTune (%s): %w", target.addr, err)
	}
	c.mu.Lock()
	c.jobs[resp.Msg.JobId] = target
	c.mu.Unlock()
	return resp.Msg.JobId, nil
}

func (c *Client) pickIdle(ctx context.Context) (replica, error) {
	var errs []error
	for _, r := range c.replicas.Order() {
		c.mu.Lock()
		isReserved := c.reserved[r.addr]
		c.mu.Unlock()
		if isReserved {
			errs = append(errs, fmt.Errorf("%s: reservada para otro fine-tuning", r.addr))
			continue
		}
		h, err := r.conn.Health(ctx, connect.NewRequest(&neov1.ModelHealthRequest{}))
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", r.addr, err))
			continue
		}
		if h.Msg.GetOk() && !h.Msg.GetTraining() {
			return r, nil
		}
		errs = append(errs, fmt.Errorf("%s: ya está entrenando", r.addr))
	}
	return replica{}, fmt.Errorf("neo-model: ninguna réplica libre para entrenar: %w", errors.Join(errs...))
}

func (c *Client) release(addr string) {
	c.mu.Lock()
	delete(c.reserved, addr)
	c.mu.Unlock()
}

// WatchJob reenvía el progreso del fine-tuning. El llamador recorre el
// iterador hasta que termine o el contexto se cancele.
func (c *Client) WatchJob(ctx context.Context, jobID string) iter.Seq2[JobEvent, error] {
	return func(yield func(JobEvent, error) bool) {
		c.mu.Lock()
		target, ok := c.jobs[jobID]
		c.mu.Unlock()
		if !ok {
			yield(JobEvent{}, fmt.Errorf("neo-model WatchJob: job %q desconocido para esta instancia de neo-api", jobID))
			return
		}
		defer func() {
			c.mu.Lock()
			delete(c.jobs, jobID)
			c.mu.Unlock()
			c.release(target.addr)
		}()

		stream, err := target.conn.WatchJob(ctx, connect.NewRequest(&neov1.JobRef{JobId: jobID}))
		if err != nil {
			yield(JobEvent{}, fmt.Errorf("neo-model WatchJob (%s): %w", target.addr, err))
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

// Health consulta el RPC Health de cada réplica (model.proto). Error si
// alguna no responde o responde ok=false; una réplica entrenando sigue
// sana (solo tiene la inferencia en pausa).
func (c *Client) Health(ctx context.Context) error {
	var errs []error
	for _, r := range c.replicas.All() {
		resp, err := r.conn.Health(ctx, connect.NewRequest(&neov1.ModelHealthRequest{}))
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", r.addr, err))
			continue
		}
		if !resp.Msg.GetOk() {
			errs = append(errs, fmt.Errorf("%s no está listo: %s", r.addr, resp.Msg.GetDetail()))
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("neo-model: %w", errors.Join(errs...))
	}
	return nil
}
