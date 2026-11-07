package runs

// Formas JSON de los eventos SSE de un run (ver Contratos en el brief).
// AnswerPayload sigue la forma real del API System One: qué campos trae
// depende de Type ("noul" | "choice" | "score"). Los punteros distinguen
// "no aplica" (nil) de un valor real en 0.

type StagePayload struct {
	Name   string `json:"name"`
	Status string `json:"status"` // "started" | "done" | "error"
	Ms     int64  `json:"ms"`
}

type AnswerPayload struct {
	Type          string             `json:"type"`
	Noul          *float64           `json:"noul,omitempty"`
	Choice        string             `json:"choice,omitempty"`
	Score         *float64           `json:"score,omitempty"`
	Legend        map[string]string  `json:"legend,omitempty"`
	Probabilities map[string]float64 `json:"probabilities,omitempty"`
	Confidence    *float64           `json:"confidence,omitempty"`
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
