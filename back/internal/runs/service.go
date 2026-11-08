// Package runs es la Facade: HTTP y Connect llaman un solo Decide(); el
// orden de las etapas (buscar precedentes, decidir, aplicar cascada,
// registrar) vive en un único lugar.
package runs

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"

	"neo-api/internal/cascade"
	"neo-api/internal/events"
	"neo-api/internal/ledger"
	"neo-api/internal/policy"
	"neo-api/internal/provider"
	"neo-api/internal/vectorclient"
	"neo-api/internal/workflow"
)

const runTimeout = 30 * time.Second

type DecisionService struct {
	workflows *workflow.Store
	vector    *vectorclient.Client
	providers map[string]provider.Provider
	broker    *events.Broker
	ledger    *ledger.Writer
}

func NewDecisionService(
	workflows *workflow.Store,
	vector *vectorclient.Client,
	providers map[string]provider.Provider,
	broker *events.Broker,
	ledgerWriter *ledger.Writer,
) *DecisionService {
	return &DecisionService{
		workflows: workflows,
		vector:    vector,
		providers: providers,
		broker:    broker,
		ledger:    ledgerWriter,
	}
}

// StartRun valida el workflow, arranca el run en segundo plano y devuelve de
// inmediato el run_id: el front se suscribe a Events(runID) para verlo avanzar.
func (s *DecisionService) StartRun(workflowID, text string) (runID string, err error) {
	wf, ok := s.workflows.Get(workflowID)
	if !ok {
		return "", fmt.Errorf("workflow desconocido: %q", workflowID)
	}

	runID = uuid.NewString()
	go s.run(runID, wf, text)
	return runID, nil
}

func (s *DecisionService) Events(runID string) (ch chan events.Event, unsubscribe func()) {
	return s.broker.Subscribe(runID)
}

func (s *DecisionService) run(runID string, wf *workflow.Workflow, text string) {
	ctx, cancel := context.WithTimeout(context.Background(), runTimeout)
	defer cancel()
	defer s.broker.Close(runID)

	matches, err := s.stageSearch(ctx, runID, wf, text)
	if err != nil {
		s.publishError(runID, err)
		return
	}

	precedents := formatPrecedents(matches)
	state, err := wf.RenderState(workflow.StateVars{Text: text, Precedents: precedents})
	if err != nil {
		s.publishError(runID, err)
		return
	}

	resp, decideLatency, err := s.stageDecide(ctx, runID, wf, state)
	if err != nil {
		s.publishError(runID, err)
		return
	}

	s.stageCascade(runID, wf, text, resp, decideLatency)

	s.broker.Publish(runID, "run.done", mustJSON(DonePayload{RunID: runID}))
}

func (s *DecisionService) stageSearch(ctx context.Context, runID string, wf *workflow.Workflow, text string) ([]vectorclient.Match, error) {
	start := time.Now()
	s.publishStage(runID, "buscar-precedentes", "started", 0)

	var matches []vectorclient.Match
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var err error
		matches, err = s.vector.Search(gctx, wf.ID, text, wf.Search.TopK)
		return err
	})
	if err := g.Wait(); err != nil {
		s.publishStage(runID, "buscar-precedentes", "error", time.Since(start).Milliseconds())
		return nil, err
	}

	s.publishStage(runID, "buscar-precedentes", "done", time.Since(start).Milliseconds())
	return matches, nil
}

func (s *DecisionService) stageDecide(ctx context.Context, runID string, wf *workflow.Workflow, state string) (provider.Response, time.Duration, error) {
	start := time.Now()
	s.publishStage(runID, "decidir", "started", 0)

	kind := policy.SelectProvider(wf)
	p, ok := s.providers[kind]
	if !ok {
		err := fmt.Errorf("proveedor %q no disponible (¿falta JEV_API_KEY?)", kind)
		s.publishStage(runID, "decidir", "error", time.Since(start).Milliseconds())
		return provider.Response{}, 0, err
	}

	questions := make(map[string]provider.Question, len(wf.Questions))
	for name, q := range wf.Questions {
		questions[name] = provider.Question{
			Type:         q.Type,
			Instructions: q.Instructions,
			Criteria:     q.Criteria,
			ScoreLevels:  q.ScoreLevels,
			NoulTrue:     q.NoulTrue,
			NoulFalse:    q.NoulFalse,
		}
	}

	resp, err := p.Decide(ctx, provider.Request{Model: wf.Model, State: state, Questions: questions})
	elapsed := time.Since(start)
	if err != nil {
		s.publishStage(runID, "decidir", "error", elapsed.Milliseconds())
		return provider.Response{}, 0, err
	}

	s.publishStage(runID, "decidir", "done", elapsed.Milliseconds())
	return resp, elapsed, nil
}

func (s *DecisionService) stageCascade(runID string, wf *workflow.Workflow, text string, resp provider.Response, decideLatency time.Duration) {
	start := time.Now()
	s.publishStage(runID, "cascada", "started", 0)

	confidence := overallConfidence(resp)
	route := cascade.Route(confidence, wf.Cascade.Auto, wf.Cascade.LLM)
	answers := toAnswerPayloads(resp.Answers)

	s.broker.Publish(runID, "run.decision", mustJSON(DecisionPayload{
		Answers:    answers,
		Confidence: confidence,
		Route:      route,
	}))
	s.publishStage(runID, "cascada", "done", time.Since(start).Milliseconds())

	answersJSON, err := json.Marshal(answers)
	if err != nil {
		slog.Error("runs: no se pudo serializar answers para la bitácora", "run_id", runID, "error", err)
		answersJSON = []byte("{}")
	}
	s.ledger.Enqueue(ledger.Decision{
		RunID:           runID,
		WorkflowID:      wf.ID,
		WorkflowVersion: wf.Version,
		Provider:        policy.SelectProvider(wf),
		Model:           resp.Model,
		InputText:       text,
		Answers:         answersJSON,
		Confidence:      confidence,
		Route:           route,
		LatencyMs:       int(decideLatency.Milliseconds()),
	})
}

// toAnswerPayloads traduce provider.Answer (tagged union en Go) a la forma
// JSON real de System One: solo los campos del Type de cada respuesta.
func toAnswerPayloads(answers map[string]provider.Answer) map[string]AnswerPayload {
	out := make(map[string]AnswerPayload, len(answers))
	for name, a := range answers {
		switch a.Type {
		case "noul":
			noul := a.Noul
			out[name] = AnswerPayload{Type: "noul", Noul: &noul}
		case "score":
			score := a.Score
			confidence := a.Confidence
			out[name] = AnswerPayload{
				Type: "score", Score: &score, Legend: a.Legend,
				Probabilities: a.Probabilities, Confidence: &confidence,
			}
		default: // "choice"
			confidence := a.Confidence
			out[name] = AnswerPayload{
				Type: "choice", Choice: a.Choice,
				Probabilities: a.Probabilities, Confidence: &confidence,
			}
		}
	}
	return out
}

func (s *DecisionService) publishStage(runID, name, status string, ms int64) {
	s.broker.Publish(runID, "run.stage", mustJSON(StagePayload{Name: name, Status: status, Ms: ms}))
}

func (s *DecisionService) publishError(runID string, err error) {
	slog.Error("runs: fallo en el run", "run_id", runID, "error", err)
	s.broker.Publish(runID, "run.error", mustJSON(ErrorPayload{Error: err.Error()}))
}

// overallConfidence toma la menor confianza entre las respuestas: la cascada
// es tan segura como su pregunta más dudosa.
func overallConfidence(resp provider.Response) float64 {
	min := 1.0
	found := false
	for _, a := range resp.Answers {
		c := a.EffectiveConfidence()
		if !found || c < min {
			min = c
			found = true
		}
	}
	if !found {
		return 0
	}
	return min
}

func formatPrecedents(matches []vectorclient.Match) string {
	if len(matches) == 0 {
		return "(sin precedentes)"
	}
	out := ""
	for _, m := range matches {
		out += fmt.Sprintf("- [%.2f] %s\n", m.Score, m.Text)
	}
	return out
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		slog.Error("runs: no se pudo serializar un evento", "error", err)
		return []byte("{}")
	}
	return b
}
