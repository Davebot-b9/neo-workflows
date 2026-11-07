// Package events implementa el Observer: un Broker de SSE que reparte
// eventos de runs y jobs a cada conexión abierta, sin que quien publica
// conozca a los suscriptores.
package events

import "sync"

type Event struct {
	ID   uint64
	Type string
	Data []byte
}

const historyLimit = 256

type topicState struct {
	subs    map[chan Event]struct{}
	history []Event // backlog acotado: un run simulado puede terminar antes de
	// que el cliente SSE llegue a suscribirse (sin esto, ese run se ve vacío).
	next   uint64
	closed bool
}

type Broker struct {
	mu     sync.Mutex
	topics map[string]*topicState
}

func NewBroker() *Broker {
	return &Broker{topics: make(map[string]*topicState)}
}

// Subscribe registra un canal con búfer para topic. Si ya hay backlog (el
// topic empezó antes de que este suscriptor llegara), lo recibe primero, en
// orden, antes de cualquier evento en vivo. Si el topic ya se cerró, recibe
// el backlog completo y el canal se cierra de inmediato.
func (b *Broker) Subscribe(topic string) (ch chan Event, unsubscribe func()) {
	ch = make(chan Event, historyLimit+32)

	b.mu.Lock()
	ts := b.topic(topic)
	for _, ev := range ts.history {
		ch <- ev // no bloquea: el búfer del canal es más grande que el backlog
	}
	if ts.closed {
		b.mu.Unlock()
		close(ch)
		return ch, func() {}
	}
	ts.subs[ch] = struct{}{}
	b.mu.Unlock()

	return ch, func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		ts, ok := b.topics[topic]
		if !ok {
			return
		}
		if _, present := ts.subs[ch]; !present {
			return // ya se dio de baja o el topic ya cerró este canal
		}
		delete(ts.subs, ch)
		close(ch)
	}
}

// Publish entrega ev a cada suscriptor en vivo de topic sin bloquear, y lo
// agrega al backlog para quien se suscriba después.
func (b *Broker) Publish(topic string, eventType string, data []byte) {
	b.mu.Lock()
	defer b.mu.Unlock()

	ts := b.topic(topic)
	ts.next++
	ev := Event{ID: ts.next, Type: eventType, Data: data}

	ts.history = append(ts.history, ev)
	if len(ts.history) > historyLimit {
		ts.history = ts.history[len(ts.history)-historyLimit:]
	}

	for ch := range ts.subs {
		select {
		case ch <- ev: // entrega sin bloquear
		default: // suscriptor lento: se descarta el evento
		}
	}
}

// Close cierra a todos los suscriptores en vivo de topic (al terminar un
// run/job). El backlog se conserva para quien se suscriba tarde.
func (b *Broker) Close(topic string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	ts := b.topic(topic)
	for ch := range ts.subs {
		close(ch)
	}
	ts.subs = make(map[chan Event]struct{})
	ts.closed = true
}

func (b *Broker) topic(name string) *topicState {
	ts, ok := b.topics[name]
	if !ok {
		ts = &topicState{subs: make(map[chan Event]struct{})}
		b.topics[name] = ts
	}
	return ts
}
