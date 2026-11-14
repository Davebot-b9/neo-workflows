package workflow

import "testing"

func TestLoadDirAndRenderState(t *testing.T) {
	store, err := LoadDir("../../../workflows")
	if err != nil {
		t.Fatalf("LoadDir: %v", err)
	}

	wf, ok := store.Get("clasificar-documento")
	if !ok {
		t.Fatalf("no se encontró el workflow clasificar-documento")
	}

	state, err := wf.RenderState(StateVars{Text: "factura #1", Precedents: "(ninguno)"})
	if err != nil {
		t.Fatalf("RenderState: %v", err)
	}
	if state == "" {
		t.Error("RenderState devolvió un estado vacío")
	}
}

func TestValidateRejectsLatestModel(t *testing.T) {
	wf := &Workflow{
		ID:        "x",
		Provider:  "local",
		Model:     "latest",
		Questions: map[string]Question{"a": {Type: "noul"}},
		Cascade:   Cascade{Auto: 0.9, LLM: 0.6},
	}
	if err := wf.Validate(); err == nil {
		t.Error("Validate debería rechazar model: \"latest\"")
	}
}

func TestValidateAdapter(t *testing.T) {
	base := func(provider, adapter string) *Workflow {
		return &Workflow{
			ID:        "x",
			Provider:  provider,
			Model:     "OmniJev/OneJev-0.8B@c02e305",
			Adapter:   adapter,
			Questions: map[string]Question{"a": {Type: "noul"}},
			Cascade:   Cascade{Auto: 0.9, LLM: 0.6},
		}
	}

	cases := []struct {
		name     string
		provider string
		adapter  string
		ok       bool
	}{
		{"sin adaptador", "local", "", true},
		{"job_id válido", "local", "334a72fe-cef6-48f8-af3a-8402637081f5", true},
		{"ruta relativa", "local", "../etc/passwd", false},
		{"con barra", "local", "a/b", false},
		{"con jev", "jev", "334a72fe-cef6-48f8-af3a-8402637081f5", false},
	}
	for _, c := range cases {
		err := base(c.provider, c.adapter).Validate()
		if (err == nil) != c.ok {
			t.Errorf("%s: Validate() = %v, se esperaba ok=%v", c.name, err, c.ok)
		}
	}
}
