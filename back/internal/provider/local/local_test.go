package local

import (
	"context"
	"errors"
	"testing"

	"connectrpc.com/connect"

	neov1 "neo-api/internal/genproto/neo/v1"
	"neo-api/internal/genproto/neo/v1/neov1connect"
	"neo-api/internal/provider"
)

// fakeReplica solo implementa Decide; el resto de la interfaz queda sin
// usar (llamarlo haría panic, y así se notaría en la prueba).
type fakeReplica struct {
	neov1connect.ModelServiceClient
	err      error
	calls    int
	gotAdapt string
}

func (f *fakeReplica) Decide(_ context.Context, req *connect.Request[neov1.DecideRequest]) (*connect.Response[neov1.DecideResponse], error) {
	f.calls++
	f.gotAdapt = req.Msg.GetAdapter()
	if f.err != nil {
		return nil, f.err
	}
	return connect.NewResponse(&neov1.DecideResponse{
		Model: req.Msg.GetModel(),
		Answers: map[string]*neov1.Answer{
			"urgente": {Kind: &neov1.Answer_Noul{Noul: &neov1.NoulAnswer{Noul: 0.9}}},
		},
	}), nil
}

func request() provider.Request {
	return provider.Request{
		Model:     "OmniJev/OneJev-0.8B@c02e305",
		Adapter:   "334a72fe",
		Questions: map[string]provider.Question{"urgente": {Type: "noul"}},
	}
}

func TestDecideSkipsUnavailableReplica(t *testing.T) {
	training := &fakeReplica{err: connect.NewError(connect.CodeUnavailable, errors.New("entrenando"))}
	healthy := &fakeReplica{}
	a := newWithClients([]neov1connect.ModelServiceClient{training, healthy})

	resp, err := a.Decide(context.Background(), request())
	if err != nil {
		t.Fatalf("Decide: %v", err)
	}
	if training.calls != 1 || healthy.calls != 1 {
		t.Fatalf("llamadas: entrenando=%d sana=%d, se esperaba 1 y 1", training.calls, healthy.calls)
	}
	if healthy.gotAdapt != "334a72fe" {
		t.Errorf("adapter no llegó a la réplica: %q", healthy.gotAdapt)
	}
	if got := resp.Answers["urgente"].Noul; got != 0.9 {
		t.Errorf("noul = %v", got)
	}
}

func TestDecideDoesNotRetryOtherErrors(t *testing.T) {
	missing := &fakeReplica{err: connect.NewError(connect.CodeNotFound, errors.New("no existe el adaptador"))}
	other := &fakeReplica{}
	a := newWithClients([]neov1connect.ModelServiceClient{missing, other})

	_, err := a.Decide(context.Background(), request())
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Fatalf("err = %v, se esperaba NotFound", err)
	}
	if other.calls != 0 {
		t.Errorf("un NotFound (el adaptador no está en el volumen compartido) no debe probarse en otra réplica")
	}
}

func TestDecideAllReplicasUnavailable(t *testing.T) {
	busy := func() *fakeReplica {
		return &fakeReplica{err: connect.NewError(connect.CodeUnavailable, errors.New("ocupada"))}
	}
	a := newWithClients([]neov1connect.ModelServiceClient{busy(), busy()})

	_, err := a.Decide(context.Background(), request())
	if connect.CodeOf(err) != connect.CodeUnavailable {
		t.Fatalf("err = %v, se esperaba Unavailable", err)
	}
}
