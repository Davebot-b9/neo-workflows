package jev

import (
	"encoding/json"
	"testing"

	"neo-api/internal/provider"
)

func TestWireQuestionShapesPerType(t *testing.T) {
	choice := wireQuestion(provider.Question{Type: "choice", Criteria: map[string]string{"a": "A"}})
	if _, ok := choice["criteria"].(map[string]string); !ok {
		t.Errorf("choice: criteria debería ser un mapa, salió %T", choice["criteria"])
	}

	score := wireQuestion(provider.Question{Type: "score", ScoreLevels: []string{"bajo", "alto"}})
	levels, ok := score["criteria"].([]string)
	if !ok || len(levels) != 2 {
		t.Errorf("score: criteria debería ser una lista ordenada de 2, salió %#v", score["criteria"])
	}

	noul := wireQuestion(provider.Question{Type: "noul", NoulTrue: "sí", NoulFalse: "no"})
	crit, ok := noul["criteria"].(map[string]string)
	if !ok || crit["true"] != "sí" || crit["false"] != "no" {
		t.Errorf("noul: criteria debería ser {true,false}, salió %#v", noul["criteria"])
	}

	noulSinCriteria := wireQuestion(provider.Question{Type: "noul"})
	if _, present := noulSinCriteria["criteria"]; present {
		t.Error("noul sin NoulTrue/NoulFalse no debería mandar criteria")
	}
}

func TestParseWireAnswerRoundTrip(t *testing.T) {
	cases := []struct {
		name string
		json string
		want provider.Answer
	}{
		{
			name: "noul",
			json: `{"type":"noul","noul":0.82}`,
			want: provider.Answer{Type: "noul", Noul: 0.82},
		},
		{
			name: "choice",
			json: `{"type":"choice","choice":"factura","probabilities":{"factura":0.9,"contrato":0.1},"confidence":0.8}`,
			want: provider.Answer{Type: "choice", Choice: "factura", Probabilities: map[string]float64{"factura": 0.9, "contrato": 0.1}, Confidence: 0.8},
		},
		{
			name: "score",
			json: `{"type":"score","score":2.5,"legend":{"0":"bajo","1":"alto"},"probabilities":{"0":0.3,"1":0.7},"confidence":0.4}`,
			want: provider.Answer{Type: "score", Score: 2.5, Legend: map[string]string{"0": "bajo", "1": "alto"}, Probabilities: map[string]float64{"0": 0.3, "1": 0.7}, Confidence: 0.4},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := parseWireAnswer(json.RawMessage(c.json))
			if err != nil {
				t.Fatalf("parseWireAnswer: %v", err)
			}
			if got.Type != c.want.Type || got.Noul != c.want.Noul || got.Choice != c.want.Choice ||
				got.Score != c.want.Score || got.Confidence != c.want.Confidence {
				t.Errorf("got %+v, quería %+v", got, c.want)
			}
		})
	}
}

func TestParseWireAnswerUnknownType(t *testing.T) {
	if _, err := parseWireAnswer(json.RawMessage(`{"type":"mystery"}`)); err == nil {
		t.Error("un type desconocido debería dar error, no silenciarse")
	}
}
