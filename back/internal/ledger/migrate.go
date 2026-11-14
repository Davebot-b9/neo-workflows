package ledger

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Postgres solo corre docker-entrypoint-initdb.d al crear el volumen, así
// que una migración nueva nunca llegaría a una base ya existente. neo-api
// aplica al arrancar las que falten, en orden, y anota cada una.
//
//go:embed migrations/*.sql
var migrationsFS embed.FS

const createMigrationsTableSQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`

// Migrate aplica cada migrations/*.sql que no esté en schema_migrations,
// cada una en su propia transacción. Las de este repo son idempotentes (IF
// NOT EXISTS), así que una base creada por initdb las acepta sin problema.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	if _, err := pool.Exec(ctx, createMigrationsTableSQL); err != nil {
		return fmt.Errorf("ledger: creando schema_migrations: %w", err)
	}

	names, err := fs.Glob(migrationsFS, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)

	for _, name := range names {
		var applied bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1)`, name).Scan(&applied); err != nil {
			return fmt.Errorf("ledger: consultando %s: %w", name, err)
		}
		if applied {
			continue
		}
		sql, err := migrationsFS.ReadFile(name)
		if err != nil {
			return err
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("ledger: aplicando %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, name); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("ledger: anotando %s: %w", name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
		slog.Info("ledger: migración aplicada", "name", name)
	}
	return nil
}
