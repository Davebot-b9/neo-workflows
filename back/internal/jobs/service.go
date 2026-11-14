// Package jobs orquesta el fine-tuning: StartFineTune en neo-model y un
// relay de WatchJob hacia el broker (una goroutine por stream, ver
// Concurrencia en Go).
package jobs

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"neo-api/internal/events"
	"neo-api/internal/ledger"
	"neo-api/internal/modelclient"
)

type ProgressPayload struct {
	Step     uint32  `json:"step"`
	MaxSteps uint32  `json:"max_steps"`
	Loss     float64 `json:"loss"`
	ETA      string  `json:"eta"`
}

type DonePayload struct {
	JobID      string `json:"job_id"`
	AdapterURI string `json:"adapter_uri"`
}

type ErrorPayload struct {
	Error string `json:"error"`
}

// AdapterRegistry guarda cada adaptador que deja un fine-tuning terminado
// (ledger.Adapters en producción).
type AdapterRegistry interface {
	Register(ctx context.Context, rec ledger.AdapterRecord) error
}

type JobService struct {
	model    *modelclient.Client
	broker   *events.Broker
	adapters AdapterRegistry
}

func NewJobService(model *modelclient.Client, broker *events.Broker, adapters AdapterRegistry) *JobService {
	return &JobService{model: model, broker: broker, adapters: adapters}
}

func (s *JobService) StartFineTune(ctx context.Context, baseModel, datasetURI string, hyperparameters map[string]string) (jobID string, err error) {
	jobID, err = s.model.StartFineTune(ctx, baseModel, datasetURI, hyperparameters)
	if err != nil {
		return "", err
	}
	go s.relay(jobID, ledger.AdapterRecord{
		ID:              jobID,
		BaseModel:       baseModel,
		DatasetURI:      datasetURI,
		Hyperparameters: hyperparameters,
	})
	return jobID, nil
}

func (s *JobService) Events(jobID string) (ch chan events.Event, unsubscribe func()) {
	return s.broker.Subscribe(jobID)
}

func (s *JobService) relay(jobID string, adapter ledger.AdapterRecord) {
	defer s.broker.Close(jobID)

	for ev, err := range s.model.WatchJob(context.Background(), jobID) {
		if err != nil {
			slog.Error("jobs: fallo en WatchJob", "job_id", jobID, "error", err)
			s.broker.Publish(jobID, "job.error", mustJSON(ErrorPayload{Error: err.Error()}))
			return
		}

		switch ev.Status {
		case "done":
			adapter.AdapterURI = ev.AdapterURI
			s.register(adapter)
			s.broker.Publish(jobID, "job.done", mustJSON(DonePayload{JobID: jobID, AdapterURI: ev.AdapterURI}))
		case "error":
			s.broker.Publish(jobID, "job.error", mustJSON(ErrorPayload{Error: ev.Error}))
		default:
			s.broker.Publish(jobID, "job.progress", mustJSON(ProgressPayload{
				Step: ev.Step, MaxSteps: ev.MaxSteps, Loss: ev.Loss, ETA: ev.ETA,
			}))
		}
	}
}

// register no hace fallar el job si Postgres no responde: el adaptador ya
// quedó guardado en el volumen de neo-model, solo se pierde la entrada del
// registro (se avisa en el log).
func (s *JobService) register(rec ledger.AdapterRecord) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := s.adapters.Register(ctx, rec); err != nil {
		slog.Error("jobs: no se pudo registrar el adaptador", "job_id", rec.ID, "error", err)
	}
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		slog.Error("jobs: no se pudo serializar un evento", "error", err)
		return []byte("{}")
	}
	return b
}
