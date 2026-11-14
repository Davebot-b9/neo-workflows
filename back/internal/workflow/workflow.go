// Package workflow carga y valida workflows/*.yaml: preguntas, umbrales y
// modelo fijo. No decide nada; solo describe la forma de un run.
package workflow

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"text/template"

	"gopkg.in/yaml.v3"
)

// adapterID es el job_id de un fine-tuning, nunca una ruta: neo-model lo
// une a /data/adapters, así que no puede traer "/" ni "..". Mismo patrón que
// valida model/neo_model/adapters.py.
var adapterID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`)

// Question sigue la forma real del API System One (verificada contra el
// código de qev, la librería de OneJev: ver CLAUDE.md). Qué campos importan
// depende de Type: "choice" usa Criteria (opción -> descripción); "score"
// usa ScoreLevels, una lista ORDENADA de niveles (el índice es el valor);
// "noul" usa NoulTrue/NoulFalse, ambos opcionales.
type Question struct {
	Type         string            `yaml:"type" json:"type"`
	Instructions string            `yaml:"instructions" json:"instructions"`
	Criteria     map[string]string `yaml:"criteria,omitempty" json:"criteria,omitempty"`
	ScoreLevels  []string          `yaml:"score_levels,omitempty" json:"score_levels,omitempty"`
	NoulTrue     string            `yaml:"noul_true,omitempty" json:"noul_true,omitempty"`
	NoulFalse    string            `yaml:"noul_false,omitempty" json:"noul_false,omitempty"`
}

type Search struct {
	TopK uint32 `yaml:"top_k" json:"top_k"`
}

type Cascade struct {
	Auto float64 `yaml:"auto" json:"auto"`
	LLM  float64 `yaml:"llm" json:"llm"`
}

type Workflow struct {
	ID            string              `yaml:"id" json:"id"`
	Version       int                 `yaml:"version" json:"version"`
	Provider      string              `yaml:"provider" json:"provider"`
	Model         string              `yaml:"model" json:"model"`
	Adapter       string              `yaml:"adapter,omitempty" json:"adapter,omitempty"` // job_id de un LoRA entrenado; vacío = modelo base
	Search        Search              `yaml:"search" json:"search"`
	StateTemplate string              `yaml:"state_template" json:"-"`
	Questions     map[string]Question `yaml:"questions" json:"questions"`
	Cascade       Cascade             `yaml:"cascade" json:"cascade"`
}

// StateVars son los datos disponibles dentro de state_template.
type StateVars struct {
	Text       string
	Precedents string
}

func (w *Workflow) RenderState(vars StateVars) (string, error) {
	tmpl, err := template.New(w.ID).Parse(w.StateTemplate)
	if err != nil {
		return "", fmt.Errorf("workflow %q: plantilla inválida: %w", w.ID, err)
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, vars); err != nil {
		return "", fmt.Errorf("workflow %q: no se pudo renderizar state_template: %w", w.ID, err)
	}
	return buf.String(), nil
}

func (w *Workflow) Validate() error {
	if w.ID == "" {
		return fmt.Errorf("workflow sin id")
	}
	if w.Provider != "local" && w.Provider != "jev" {
		return fmt.Errorf("workflow %q: provider debe ser \"local\" o \"jev\", no %q", w.ID, w.Provider)
	}
	if w.Model == "" || w.Model == "latest" {
		return fmt.Errorf("workflow %q: model debe ser una versión fija, nunca vacío ni \"latest\"", w.ID)
	}
	if w.Adapter != "" {
		if w.Provider != "local" {
			return fmt.Errorf("workflow %q: adapter solo aplica con provider \"local\" (Jev no sirve adaptadores propios)", w.ID)
		}
		if !adapterID.MatchString(w.Adapter) {
			return fmt.Errorf("workflow %q: adapter %q inválido, debe ser el job_id de un fine-tuning", w.ID, w.Adapter)
		}
	}
	if len(w.Questions) == 0 {
		return fmt.Errorf("workflow %q: necesita al menos una pregunta", w.ID)
	}
	for name, q := range w.Questions {
		switch q.Type {
		case "choice":
			if len(q.Criteria) == 0 {
				return fmt.Errorf("workflow %q: la pregunta %q es choice y necesita criteria", w.ID, name)
			}
		case "score":
			if len(q.ScoreLevels) == 0 {
				return fmt.Errorf("workflow %q: la pregunta %q es score y necesita score_levels", w.ID, name)
			}
		case "noul":
			// NoulTrue/NoulFalse son opcionales.
		default:
			return fmt.Errorf("workflow %q: la pregunta %q tiene type %q, debe ser choice, score o noul", w.ID, name, q.Type)
		}
	}
	if w.Cascade.Auto <= w.Cascade.LLM {
		return fmt.Errorf("workflow %q: cascade.auto (%.2f) debe ser mayor que cascade.llm (%.2f)", w.ID, w.Cascade.Auto, w.Cascade.LLM)
	}
	return nil
}

// Store mantiene en memoria los workflows cargados desde dir.
type Store struct {
	byID map[string]*Workflow
}

func LoadDir(dir string) (*Store, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("leyendo %s: %w", dir, err)
	}

	byID := make(map[string]*Workflow)
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".yaml" {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("leyendo %s: %w", path, err)
		}
		var wf Workflow
		if err := yaml.Unmarshal(raw, &wf); err != nil {
			return nil, fmt.Errorf("parseando %s: %w", path, err)
		}
		if err := wf.Validate(); err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		byID[wf.ID] = &wf
	}
	if len(byID) == 0 {
		return nil, fmt.Errorf("no se encontró ningún workflow *.yaml en %s", dir)
	}
	return &Store{byID: byID}, nil
}

func (s *Store) Get(id string) (*Workflow, bool) {
	wf, ok := s.byID[id]
	return wf, ok
}

func (s *Store) List() []*Workflow {
	out := make([]*Workflow, 0, len(s.byID))
	for _, wf := range s.byID {
		out = append(out, wf)
	}
	return out
}
