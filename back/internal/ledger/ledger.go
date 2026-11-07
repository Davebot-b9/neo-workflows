// Package ledger escribe la bitácora append-only de decisiones en
// PostgreSQL. Usa un canal con búfer e inserta por lote cada N eventos o
// T ms, para no sumar latencia a la decisión (ver Concurrencia en Go).
package ledger

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Decision struct {
	RunID            string
	WorkflowID       string
	WorkflowVersion  int
	Provider         string
	Model            string
	InputText        string
	Answers          json.RawMessage
	Confidence       float64
	Route            string
	LatencyMs        int
}

type Writer struct {
	pool      *pgxpool.Pool
	queue     chan Decision
	batchSize int
	flushEvery time.Duration
	done      chan struct{}
}

func NewWriter(pool *pgxpool.Pool) *Writer {
	return &Writer{
		pool:       pool,
		queue:      make(chan Decision, 256),
		batchSize:  20,
		flushEvery: 500 * time.Millisecond,
		done:       make(chan struct{}),
	}
}

// Enqueue nunca bloquea al run: si el búfer está lleno, se descarta y se
// registra en el log (preferible a frenar una decisión por la bitácora).
func (w *Writer) Enqueue(d Decision) {
	select {
	case w.queue <- d:
	default:
		slog.Warn("ledger: cola llena, se descarta una decisión", "run_id", d.RunID)
	}
}

// Run procesa el canal hasta que ctx se cancela y vacía lo pendiente antes
// de salir (apagado ordenado).
func (w *Writer) Run(ctx context.Context) {
	defer close(w.done)

	ticker := time.NewTicker(w.flushEvery)
	defer ticker.Stop()

	batch := make([]Decision, 0, w.batchSize)
	flush := func() {
		if len(batch) == 0 {
			return
		}
		if err := w.insertBatch(context.Background(), batch); err != nil {
			slog.Error("ledger: fallo insertando lote", "error", err, "size", len(batch))
		}
		batch = batch[:0]
	}

	for {
		select {
		case <-ctx.Done():
			for {
				select {
				case d := <-w.queue:
					batch = append(batch, d)
				default:
					flush()
					return
				}
			}
		case d := <-w.queue:
			batch = append(batch, d)
			if len(batch) >= w.batchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

func (w *Writer) Wait() { <-w.done }

const insertDecisionSQL = `
INSERT INTO decisions
	(run_id, workflow_id, workflow_version, provider, model, input_text, answers, confidence, route, latency_ms)
VALUES
	($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`

// insertBatch manda el lote en un solo viaje de ida y vuelta con pgx.Batch
// (pipelining), sin los problemas de tipado binario de CopyFrom para UUID/JSONB.
func (w *Writer) insertBatch(ctx context.Context, batch []Decision) error {
	b := &pgx.Batch{}
	for _, d := range batch {
		b.Queue(insertDecisionSQL,
			d.RunID, d.WorkflowID, d.WorkflowVersion, d.Provider, d.Model,
			d.InputText, d.Answers, d.Confidence, d.Route, d.LatencyMs,
		)
	}

	br := w.pool.SendBatch(ctx, b)
	defer br.Close()

	for range batch {
		if _, err := br.Exec(); err != nil {
			return err
		}
	}
	return nil
}
