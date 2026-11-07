package events

import (
	"testing"
	"time"

	"go.uber.org/goleak"
)

func TestMain(m *testing.M) {
	goleak.VerifyTestMain(m)
}

func TestPublishSubscribeAndClose(t *testing.T) {
	b := NewBroker()
	ch, unsubscribe := b.Subscribe("run-1")
	defer unsubscribe()

	b.Publish("run-1", "run.stage", []byte(`{"name":"buscar"}`))

	select {
	case ev := <-ch:
		if ev.Type != "run.stage" {
			t.Errorf("tipo = %q, quería run.stage", ev.Type)
		}
		if ev.ID != 1 {
			t.Errorf("id = %d, quería 1", ev.ID)
		}
	case <-time.After(time.Second):
		t.Fatal("no llegó el evento")
	}

	b.Close("run-1")
	if _, open := <-ch; open {
		t.Error("el canal debería cerrarse tras Close")
	}
}

func TestSlowSubscriberNeverBlocksPublish(t *testing.T) {
	b := NewBroker()
	ch, unsubscribe := b.Subscribe("run-2")
	defer unsubscribe()

	// El búfer del canal es historyLimit+32: publicar más que eso no debe
	// bloquear (el exceso se descarta, nunca frena al publicador).
	for i := 0; i < historyLimit+64; i++ {
		b.Publish("run-2", "run.stage", []byte("{}"))
	}

	<-ch // drena al menos un evento para dejar limpio el defer unsubscribe
}

func TestLateSubscriberGetsBacklogAfterClose(t *testing.T) {
	b := NewBroker()

	// El run ya terminó (publicó y cerró) antes de que alguien se suscribiera:
	// exactamente la carrera real que se vio al probar el Fase 0 end-to-end.
	b.Publish("run-3", "run.stage", []byte(`{"name":"buscar"}`))
	b.Publish("run-3", "run.done", []byte(`{}`))
	b.Close("run-3")

	ch, unsubscribe := b.Subscribe("run-3")
	defer unsubscribe()

	var got []Event
	for ev := range ch {
		got = append(got, ev)
	}

	if len(got) != 2 {
		t.Fatalf("recibió %d eventos, quería 2 (backlog completo)", len(got))
	}
	if got[0].Type != "run.stage" || got[1].Type != "run.done" {
		t.Errorf("orden incorrecto: %v", got)
	}
}
