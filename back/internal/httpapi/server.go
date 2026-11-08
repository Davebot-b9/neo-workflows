// Package httpapi expone HTTP, SSE y Connect. Toda la lógica de negocio
// vive en runs y jobs; este paquete solo traduce HTTP <-> esos servicios.
package httpapi

import (
	"context"
	"net/http"

	"neo-api/internal/jobs"
	"neo-api/internal/ledger"
	"neo-api/internal/runs"
	"neo-api/internal/workflow"
)

// HealthCheck es una dependencia que /healthz revisa. Critical decide si su
// falla tumba el status HTTP a 503 (lo que usa el healthcheck de Docker);
// una no crítica solo se reporta en deps y pone ok=false. Así una caída de
// neo-model no marca a neo-api como unhealthy (sigue sirviendo workflows,
// bitácora y errores claros por SSE).
type HealthCheck struct {
	Name     string
	Critical bool
	Fn       func(ctx context.Context) error
}

// DecisionLister lee la bitácora para GET /api/runs (ledger.Reader en producción).
type DecisionLister interface {
	Recent(ctx context.Context, limit int) ([]ledger.Record, error)
}

type Server struct {
	mux       *http.ServeMux
	runs      *runs.DecisionService
	jobs      *jobs.JobService
	workflows *workflow.Store
	decisions DecisionLister
	checks    []HealthCheck
}

func NewServer(runsSvc *runs.DecisionService, jobsSvc *jobs.JobService, workflows *workflow.Store, decisions DecisionLister, checks []HealthCheck) *Server {
	s := &Server{
		mux:       http.NewServeMux(),
		runs:      runsSvc,
		jobs:      jobsSvc,
		workflows: workflows,
		decisions: decisions,
		checks:    checks,
	}
	s.routes()
	return s
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /healthz", s.handleHealthz)
	s.mux.HandleFunc("GET /api/workflows", s.handleListWorkflows)

	s.mux.HandleFunc("GET /api/runs", s.handleListRuns)
	s.mux.HandleFunc("POST /api/runs", s.handleStartRun)
	s.mux.HandleFunc("GET /api/runs/{id}/events", s.handleRunEvents)

	s.mux.HandleFunc("POST /api/jobs/finetune", s.handleStartFineTune)
	s.mux.HandleFunc("GET /api/jobs/{id}/events", s.handleJobEvents)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}
