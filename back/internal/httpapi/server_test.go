package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"neo-api/internal/ledger"
)

type fakeLister struct {
	gotLimit int
	records  []ledger.Record
	err      error
}

func (f *fakeLister) Recent(_ context.Context, limit int) ([]ledger.Record, error) {
	f.gotLimit = limit
	return f.records, f.err
}

func ok(context.Context) error   { return nil }
func fail(context.Context) error { return errors.New("caído") }

func get(t *testing.T, s *Server, path string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return rec, body
}

func TestHealthzNonCriticalFailureKeeps200(t *testing.T) {
	s := NewServer(nil, nil, nil, &fakeLister{}, []HealthCheck{
		{Name: "postgres", Critical: true, Fn: ok},
		{Name: "neo-model", Fn: fail},
	})

	rec, body := get(t, s, "/healthz")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, quería 200 (neo-model no es crítico)", rec.Code)
	}
	if body["ok"] != false {
		t.Fatalf("ok = %v, quería false", body["ok"])
	}
	deps := body["deps"].(map[string]any)
	if deps["postgres"] != "ok" || deps["neo-model"] != "caído" {
		t.Fatalf("deps = %v", deps)
	}
}

func TestHealthzCriticalFailureIs503(t *testing.T) {
	s := NewServer(nil, nil, nil, &fakeLister{}, []HealthCheck{
		{Name: "postgres", Critical: true, Fn: fail},
		{Name: "neo-vector", Fn: ok},
	})
	if rec, _ := get(t, s, "/healthz"); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, quería 503", rec.Code)
	}
}

func TestListRunsLimit(t *testing.T) {
	cases := []struct {
		query     string
		wantCode  int
		wantLimit int
	}{
		{"", http.StatusOK, defaultRunsLimit},
		{"?limit=10", http.StatusOK, 10},
		{"?limit=99999", http.StatusOK, maxRunsLimit},
		{"?limit=0", http.StatusBadRequest, 0},
		{"?limit=abc", http.StatusBadRequest, 0},
	}
	for _, tc := range cases {
		lister := &fakeLister{}
		s := NewServer(nil, nil, nil, lister, nil)
		rec := httptest.NewRecorder()
		s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/runs"+tc.query, nil))
		if rec.Code != tc.wantCode {
			t.Errorf("%q: status = %d, quería %d", tc.query, rec.Code, tc.wantCode)
		}
		if lister.gotLimit != tc.wantLimit {
			t.Errorf("%q: limit = %d, quería %d", tc.query, lister.gotLimit, tc.wantLimit)
		}
	}
}

func TestListRunsEmptyIsArrayNotNull(t *testing.T) {
	s := NewServer(nil, nil, nil, &fakeLister{}, nil)
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/runs", nil))
	if got := rec.Body.String(); got != "[]\n" {
		t.Fatalf("body = %q, quería []", got)
	}
}

func TestListRunsLedgerErrorIs503(t *testing.T) {
	s := NewServer(nil, nil, nil, &fakeLister{err: errors.New("db")}, nil)
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/runs", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, quería 503", rec.Code)
	}
}
