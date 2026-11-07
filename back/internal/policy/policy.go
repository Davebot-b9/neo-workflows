// Package policy elige qué proveedor usa un run. En la Fase 0 es un
// passthrough del campo provider del workflow; es el lugar donde después
// puede entrar una regla más fina (p. ej. por sensibilidad del dato).
package policy

import "neo-api/internal/workflow"

func SelectProvider(wf *workflow.Workflow) string {
	return wf.Provider
}
