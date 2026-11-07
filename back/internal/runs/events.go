package runs

// Formas JSON de los eventos SSE de un run (ver Contratos en el brief).

type StagePayload struct {
	Name   string `json:"name"`
	Status string `json:"status"` // "started" | "done" | "error"
	Ms     int64  `json:"ms"`
}

type AnswerPayload struct {
	Probabilities map[string]float64 `json:"probabilities"`
	Confidence    float64            `json:"confidence"`
}

type DecisionPayload struct {
	Answers    map[string]AnswerPayload `json:"answers"`
	Confidence float64                  `json:"confidence"`
	Route      string                   `json:"route"`
}

type DonePayload struct {
	RunID string `json:"run_id"`
}

type ErrorPayload struct {
	Error string `json:"error"`
}
