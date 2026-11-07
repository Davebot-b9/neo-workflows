// Package grpcconn arma el *http.Client que connect-go necesita para hablar
// gRPC en texto plano (h2c) con neo-vector (Rust) y neo-model (Python),
// ninguno de los dos expone TLS en la demo local.
package grpcconn

import (
	"context"
	"crypto/tls"
	"net"
	"net/http"
	"time"

	"golang.org/x/net/http2"
)

func NewH2CClient() *http.Client {
	return &http.Client{
		Timeout: 30 * time.Second,
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
