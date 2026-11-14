package main

import (
	"os"
	"strconv"

	"neo-api/internal/grpcconn"
)

type Config struct {
	HTTPAddr     string
	VectorAddr   string
	ModelAddrs   []string // NEO_MODEL_ADDR, una por réplica separadas por coma
	DatabaseURL  string
	WorkflowsDir string
	JevBaseURL   string
	JevAPIKey    string
	ProviderRPS  float64
}

func loadConfig() Config {
	return Config{
		HTTPAddr:     getenv("NEO_HTTP_ADDR", ":8080"),
		VectorAddr:   getenv("NEO_VECTOR_ADDR", "localhost:50051"),
		ModelAddrs:   grpcconn.SplitAddrs(getenv("NEO_MODEL_ADDR", "localhost:50052")),
		DatabaseURL:  getenv("NEO_DATABASE_URL", "postgres://neo:neo@localhost:5432/neo?sslmode=disable"),
		WorkflowsDir: getenv("NEO_WORKFLOWS_DIR", "../workflows"),
		JevBaseURL:   getenv("JEV_BASE_URL", ""),
		JevAPIKey:    os.Getenv("JEV_API_KEY"),
		ProviderRPS:  getenvFloat("NEO_PROVIDER_RPS", 5),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getenvFloat(key string, fallback float64) float64 {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return fallback
	}
	return f
}
