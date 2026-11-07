package httpapi

import (
	"fmt"
	"net/http"

	"neo-api/internal/events"
)

// streamSSE escribe cada events.Event del canal como un evento SSE con id:
// hasta que el canal se cierra o el cliente se va. El Broker ya guarda un
// backlog acotado por topic (ver internal/events), así que un cliente que
// llega tarde —incluso después de que el run terminó— recibe el historial
// completo antes de que el canal se cierre.
//
// TODO (Fase 4): esto cubre "llegar tarde", pero no reconexión real con
// Last-Event-ID (retomar desde un id específico tras un corte de red).
func streamSSE(w http.ResponseWriter, r *http.Request, ch <-chan events.Event) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming no soportado", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case ev, open := <-ch:
			if !open {
				return
			}
			fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", ev.ID, ev.Type, ev.Data)
			flusher.Flush()
		}
	}
}
