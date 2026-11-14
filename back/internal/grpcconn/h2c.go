// Package grpcconn arma el *http.Client que connect-go necesita para hablar
// gRPC en texto plano (h2c) con neo-vector (Rust) y neo-model (Python),
// ninguno de los dos expone TLS en la demo local.
package grpcconn

import (
	"context"
	"crypto/tls"
	"net"
	"net/http"

	"golang.org/x/net/http2"
)

func NewH2CClient() *http.Client {
	return &http.Client{
		// No timeout global: WatchJob y WatchRun son streams que pueden durar
		// minutos. Cada llamada unary ya recibe su propio context.WithTimeout
		// en la capa que conoce el contrato; un http.Client.Timeout global
		// cancelaría cualquier fine-tuning después de 30 s.
		Timeout: 0,
		Transport: &http2.Transport{
			AllowHTTP: true,
			DialTLSContext: func(ctx context.Context, network, addr string, _ *tls.Config) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, network, addr)
			},
		},
	}
}

func BaseURL(addr string) string {
	return "http://" + addr
}
