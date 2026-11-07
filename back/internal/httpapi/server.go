// Package httpapi expone HTTP, SSE y Connect. Toda la lógica de negocio
// vive en runs y jobs; este paquete solo traduce HTTP <-> esos servicios.
package httpapi

import (
	"context"
	"net/http"

	"neo-api/internal/jobs"
	"neo-api/internal/runs"
	"neo-api/internal/workflow"
)

type HealthCheck struct {
	Name string
	Fn   func(ctx context.Context) error
}

type Server struct {
	mux       *http.ServeMux
	runs      *runs.DecisionService
	jobs      *jobs.JobService
	workflows *workflow.Store
	checks    []HealthCheck
}

func NewServer(runsSvc *runs.DecisionService, jobsSvc *jobs.JobService, workflows *workflow.Store, checks []HealthCheck) *Server {
	s := &Server{
		mux:       http.NewServeMux(),
		runs:      runsSvc,
		jobs:      jobsSvc,
		workflows: workflows,
		checks:    checks,
	}
	s.routes()
	return s
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /healthz", s.handleHealthz)
	s.mux.HandleFunc("GET /api/workflows", s.handleListWorkflows)

	s.mux.HandleFunc("POST /api/runs", s.handleStartRun)
	s.mux.HandleFunc("GET /api/runs/{id}/events", s.handleRunEvents)

	s.mux.HandleFunc("POST /api/jobs/finetune", s.handleStartFineTune)
	s.mux.HandleFunc("GET /api/jobs/{id}/events", s.handleJobEvents)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}
