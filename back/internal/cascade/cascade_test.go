package cascade

import "testing"

func TestRoute(t *testing.T) {
	cases := []struct {
		confidence float64
		want       string
	}{
		{0.95, RouteAuto},
		{0.90, RouteAuto},
		{0.75, RouteLLM},
		{0.60, RouteLLM},
		{0.10, RouteReview},
	}

	for _, c := range cases {
		if got := Route(c.confidence, 0.90, 0.60); got != c.want {
			t.Errorf("Route(%.2f) = %q, quería %q", c.confidence, got, c.want)
		}
	}
}
