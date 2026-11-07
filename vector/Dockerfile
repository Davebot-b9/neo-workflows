# El runtime de ONNX precompilado que trae el crate `ort` (dependencia de
# fastembed) necesita símbolos de glibc 2.38+ (__isoc23_strtol y afines);
# Debian bookworm (glibc 2.36) no los tiene, por eso build y runtime usan
# trixie. También se abandona distroless aquí: fastembed/onnxruntime
# necesitan más libs del sistema de las que distroless-cc ofrece.
FROM rust:1.99.1-trixie AS build
RUN apt-get update && apt-get install -y --no-install-recommends cmake && rm -rf /var/lib/apt/lists/*
WORKDIR /src

# protobuf-src compila su propio protoc: no hace falta protoc-compiler de apt.
COPY proto /proto
COPY vector/Cargo.toml vector/build.rs ./
COPY vector/src ./src
RUN cargo build --release

FROM debian:trixie-slim AS health-probe
ADD https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/v0.4.61/grpc_health_probe-linux-amd64 /grpc_health_probe
RUN chmod +x /grpc_health_probe

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/neo-vector /neo-vector
COPY --from=health-probe /grpc_health_probe /usr/local/bin/grpc_health_probe
WORKDIR /data
EXPOSE 50051
ENTRYPOINT ["/neo-vector"]
