package ledger

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AdapterRecord es un adaptador LoRA que dejó un fine-tuning terminado. Su
// ID es lo que un workflow pone en `adapter:` (ver workflows/*.yaml).
type AdapterRecord struct {
	ID              string            `json:"id"`
	BaseModel       string            `json:"base_model"`
	DatasetURI      string            `json:"dataset_uri"`
	Hyperparameters map[string]string `json:"hyperparameters"`
	AdapterURI      string            `json:"adapter_uri"`
	CreatedAt       time.Time         `json:"created_at"`
}

type Adapters struct {
	pool *pgxpool.Pool
}

func NewAdapters(pool *pgxpool.Pool) *Adapters {
	return &Adapters{pool: pool}
}

// Register anota un adaptador recién entrenado. Repetirlo con el mismo ID no
// hace nada: el job_id es único y su adaptador no cambia después de guardarse.
func (a *Adapters) Register(ctx context.Context, rec AdapterRecord) error {
	params, err := json.Marshal(rec.Hyperparameters)
	if err != nil {
		return err
	}
	_, err = a.pool.Exec(ctx, `
INSERT INTO adapters (id, base_model, dataset_uri, hyperparameters, adapter_uri)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (id) DO NOTHING`,
		rec.ID, rec.BaseModel, rec.DatasetURI, params, rec.AdapterURI)
	if err != nil {
		return fmt.Errorf("ledger: registrando adaptador %s: %w", rec.ID, err)
	}
	return nil
}

func (a *Adapters) List(ctx context.Context) ([]AdapterRecord, error) {
	rows, err := a.pool.Query(ctx, `
SELECT id, base_model, dataset_uri, hyperparameters, adapter_uri, created_at
FROM adapters
ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("ledger: consultando adapters: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (AdapterRecord, error) {
		var rec AdapterRecord
		var params []byte
		if err := row.Scan(&rec.ID, &rec.BaseModel, &rec.DatasetURI, &params, &rec.AdapterURI, &rec.CreatedAt); err != nil {
			return rec, err
		}
		rec.Hyperparameters = map[string]string{}
		if err := json.Unmarshal(params, &rec.Hyperparameters); err != nil {
			return rec, fmt.Errorf("ledger: hyperparameters de %s: %w", rec.ID, err)
		}
		return rec, nil
	})
}
