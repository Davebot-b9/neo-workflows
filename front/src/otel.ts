// Fase 4: trazas distribuidas. El navegador es el único punto de partida
// real de una traza (el usuario hace clic, todo lo demás cuelga de ahí), así
// que instrumenta fetch (las llamadas de NeoGateway a /api, ver
// src/api/client.ts) y exporta a Jaeger por OTLP/HTTP (el navegador no puede
// hablar gRPC). Puerto fijo del brief, igual que el resto de NeoGateway.
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { ZoneContextManager } from "@opentelemetry/context-zone";

const exporter = new OTLPTraceExporter({ url: "http://localhost:4318/v1/traces" });

const provider = new WebTracerProvider({
  resource: resourceFromAttributes({ "service.name": "web" }),
  spanProcessors: [new BatchSpanProcessor(exporter)],
});

provider.register({ contextManager: new ZoneContextManager() });

// Las llamadas a /api y /healthz son same-origin (proxy de Vite en dev,
// nginx en Docker, ver vite.config.ts y front/nginx.conf), así que el
// traceparent se agrega solo, sin propagateTraceHeaderCorsUrls.
registerInstrumentations({
  instrumentations: [new FetchInstrumentation()],
});
