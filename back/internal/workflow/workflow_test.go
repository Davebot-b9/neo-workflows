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
