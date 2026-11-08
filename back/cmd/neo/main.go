// neo-api: único punto de entrada y único servicio con lógica de negocio.
// Arma cada dependencia una vez en main y la inyecta (Singleton: no aplica
// como global, ver Patrones en el brief).
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"neo-api/internal/events"
	"neo-api/internal/httpapi"
	"neo-api/internal/jobs"
	"neo-api/internal/ledger"
	"neo-api/internal/modelclient"
	"neo-api/internal/provider"
	"neo-api/internal/providerfactory"
	"neo-api/internal/runs"
	"neo-api/internal/vectorclient"
	"neo-api/internal/workflow"
)

func main() {
	// La imagen final es distroless (sin shell ni wget): el propio binario
	// hace de sonda de healthcheck para Docker. Ver compose.yaml.
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheckSelf())
	}

	if err := run(); err != nil {
		slog.Error("neo-api: salida con error", "error", err)
		os.Exit(1)
	}
}

func healthcheckSelf() int {
	addr := getenv("NEO_HTTP_ADDR", ":8080")
	url := "http://localhost" + addr + "/healthz"
	if addr[0] != ':' {
		url = "http://" + addr + "/healthz"
	}

	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "healthz: status %d\n", resp.StatusCode)
		return 1
	}
	return 0
}

func run() error {
	cfg := loadConfig()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	workflows, err := workflow.LoadDir(cfg.WorkflowsDir)
	if err != nil {
		return fmt.Errorf("cargando workflows: %w", err)
	}
	slog.Info("workflows cargados", "n", len(workflows.List()))

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("conectando a PostgreSQL: %w", err)
	}
	defer pool.Close()

	vector := vectorclient.New(cfg.VectorAddr)
	model := modelclient.New(cfg.ModelAddr)

	providers, err := providerfactory.Available(provider.Config{
		LocalAddr:  cfg.ModelAddr,
		JevBaseURL: cfg.JevBaseURL,
		JevAPIKey:  cfg.JevAPIKey,
		Retries:    2,
		RPS:        cfg.ProviderRPS,
	})
	if err != nil {
		return fmt.Errorf("armando proveedores: %w", err)
	}
	slog.Info("proveedores disponibles", "kinds", providerKinds(providers))

	broker := events.NewBroker()

	ledgerWriter := ledger.NewWriter(pool)
	go ledgerWriter.Run(ctx)

	runsSvc := runs.NewDecisionService(workflows, vector, providers, broker, ledgerWriter)
	jobsSvc := jobs.NewJobService(model, broker)

	// postgres es crítico (503 si falla, lo usa el healthcheck de Docker);
	// neo-vector y neo-model se reportan pero no tumban a neo-api.
	checks := []httpapi.HealthCheck{
		{Name: "postgres", Critical: true, Fn: func(ctx context.Context) error { return pool.Ping(ctx) }},
		{Name: "neo-vector", Fn: vector.Health},
		{Name: "neo-model", Fn: model.Health},
	}

	server := httpapi.NewServer(runsSvc, jobsSvc, workflows, ledger.NewReader(pool), checks)

	httpServer := &http.Server{
		Addr:    cfg.HTTPAddr,
		Handler: server,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("neo-api escuchando", "addr", cfg.HTTPAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		slog.Info("neo-api: apagando")
	case err := <-errCh:
		return fmt.Errorf("http server: %w", err)
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		slog.Error("neo-api: shutdown forzado", "error", err)
	}

	ledgerWriter.Wait()
	return nil
}

func providerKinds(m map[string]provider.Provider) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
