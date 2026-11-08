// Package otelsetup arma el TracerProvider de neo-api (Fase 4). Exporta a
// Jaeger por OTLP/gRPC; si OTEL_EXPORTER_OTLP_ENDPOINT no está puesto, usa
// localhost:4317 y si no hay nadie escuchando, el exporter solo falla sus
// envíos en segundo plano — nunca tumba al servicio por esto.
package otelsetup

import (
	"context"
	"fmt"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

func Init(ctx context.Context, serviceName string) (shutdown func(context.Context) error, err error) {
	exporter, err := otlptracegrpc.New(ctx, otlptracegrpc.WithInsecure())
	if err != nil {
		return nil, fmt.Errorf("otelsetup: creando exporter OTLP: %w", err)
	}

	res, err := resource.New(ctx, resource.WithAttributes(
		semconv.ServiceName(serviceName),
	))
	if err != nil {
		return nil, fmt.Errorf("otelsetup: armando resource: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	// W3C Trace Context: lo que manda el navegador (traceparent) y lo que
	// Go reenvía a Rust/Python en los metadata de gRPC.
	otel.SetTextMapPropagator(propagation.TraceContext{})

	return tp.Shutdown, nil
}
