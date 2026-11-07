package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

type startRunRequest struct {
	Workflow string `json:"workflow"`
	Text     string `json:"text"`
}

type startRunResponse struct {
	RunID string `json:"run_id"`
}

func (s *Server) handleStartRun(w http.ResponseWriter, r *http.Request) {
	var req startRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "body inválido: "+err.Error())
		return
	}

	runID, err := s.runs.StartRun(req.Workflow, req.Text)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusAccepted, startRunResponse{RunID: runID})
}

func (s *Server) handleRunEvents(w http.ResponseWriter, r *http.Request) {
	runID := r.PathValue("id")
	ch, unsubscribe := s.runs.Events(runID)
	defer unsubscribe()
	streamSSE(w, r, ch)
}

type startFineTuneRequest struct {
	BaseModel       string            `json:"base_model"`
	DatasetURI      string            `json:"dataset_uri"`
	Hyperparameters map[string]string `json:"hyperparameters"`
}

type startFineTuneResponse struct {
	JobID string `json:"job_id"`
}

func (s *Server) handleStartFineTune(w http.ResponseWriter, r *http.Request) {
	var req startFineTuneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "body inválido: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	jobID, err := s.jobs.StartFineTune(ctx, req.BaseModel, req.DatasetURI, req.Hyperparameters)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	writeJSON(w, http.StatusAccepted, startFineTuneResponse{JobID: jobID})
}

func (s *Server) handleJobEvents(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("id")
	ch, unsubscribe := s.jobs.Events(jobID)
	defer unsubscribe()
	streamSSE(w, r, ch)
}

func (s *Server) handleListWorkflows(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.workflows.List())
}

type healthzResponse struct {
	OK   bool              `json:"ok"`
	Deps map[string]string `json:"deps"`
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	deps := make(map[string]string, len(s.checks))
	ok := true
	for _, check := range s.checks {
		if err := check.Fn(ctx); err != nil {
			deps[check.Name] = err.Error()
			ok = false
			continue
		}
		deps[check.Name] = "ok"
	}

	status := http.StatusOK
	if !ok {
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, healthzResponse{OK: ok, Deps: deps})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
