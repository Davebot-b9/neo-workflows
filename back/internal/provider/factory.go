package provider

// Config junta lo que cualquier constructor de proveedor necesita. El YAML
// de cada workflow solo elige Kind; el resto viene de variables de entorno.
type Config struct {
	Kind string // "local" | "jev"

	LocalAddr string

	JevBaseURL string
	JevAPIKey  string

	Retries int
	RPS     float64
}
