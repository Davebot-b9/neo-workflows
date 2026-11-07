package provider

import "testing"

func TestEffectiveConfidenceNoul(t *testing.T) {
	cases := []struct {
		noul float64
		want float64
	}{
		{0.5, 0.0},  // máxima incertidumbre
		{1.0, 1.0},  // certeza total de "true"
		{0.0, 1.0},  // certeza total de "false"
		{0.75, 0.5}, // a medio camino
		{0.25, 0.5},
	}
	for _, c := range cases {
		a := Answer{Type: "noul", Noul: c.noul}
		if got := a.EffectiveConfidence(); got != c.want {
			t.Errorf("EffectiveConfidence(noul=%.2f) = %.2f, quería %.2f", c.noul, got, c.want)
		}
	}
}

func TestEffectiveConfidenceChoiceAndScoreUseOwnField(t *testing.T) {
	choice := Answer{Type: "choice", Confidence: 0.73}
	if got := choice.EffectiveConfidence(); got != 0.73 {
		t.Errorf("choice: EffectiveConfidence() = %.2f, quería 0.73", got)
	}

	score := Answer{Type: "score", Confidence: 0.41}
	if got := score.EffectiveConfidence(); got != 0.41 {
		t.Errorf("score: EffectiveConfidence() = %.2f, quería 0.41", got)
	}
}
