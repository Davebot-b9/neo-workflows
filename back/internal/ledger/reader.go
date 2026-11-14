package ledger

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Record es una fila de decisions tal como la ve el front (GET /api/runs).
type Record struct {
	RunID           string          `json:"run_id"`
	WorkflowID      string          `json:"workflow_id"`
	WorkflowVersion int             `json:"workflow_version"`
	Provider        string          `json:"provider"`
	Model           string          `json:"model"`
	Adapter         string          `json:"adapter,omitempty"`
	InputText       string          `json:"input_text"`
	Answers         json.RawMessage `json:"answers"`
	Confidence      float64         `json:"confidence"`
	Route           string          `json:"route"`
	LatencyMs       int             `json:"latency_ms"`
	CreatedAt       time.Time       `json:"created_at"`
}

// Reader solo lee: la bitácora es append-only (los triggers de
// 0001_init.sql bloquean UPDATE/DELETE), aquí no hay nada que la modifique.
type Reader struct {
	pool *pgxpool.Pool
}

func NewReader(pool *pgxpool.Pool) *Reader {
	return &Reader{pool: pool}
}

const recentDecisionsSQL = `
SELECT run_id::text, workflow_id, workflow_version, provider, model, adapter, input_text,
       answers, confidence, route, latency_ms, created_at
FROM decisions
ORDER BY id DESC
LIMIT $1`

// Recent devuelve las últimas `limit` decisiones, de la más reciente a la más antigua.
func (r *Reader) Recent(ctx context.Context, limit int) ([]Record, error) {
	rows, err := r.pool.Query(ctx, recentDecisionsSQL, limit)
	if err != nil {
		return nil, fmt.Errorf("ledger: consultando decisions: %w", err)
	}
	records, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Record, error) {
		var rec Record
		err := row.Scan(
			&rec.RunID, &rec.WorkflowID, &rec.WorkflowVersion, &rec.Provider, &rec.Model, &rec.Adapter, &rec.InputText,
			&rec.Answers, &rec.Confidence, &rec.Route, &rec.LatencyMs, &rec.CreatedAt,
		)
		return rec, err
	})
	if err != nil {
		return nil, fmt.Errorf("ledger: leyendo decisions: %w", err)
	}
	return records, nil
}
