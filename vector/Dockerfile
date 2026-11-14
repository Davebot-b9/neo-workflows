# El runtime de ONNX precompilado que trae el crate `ort` (dependencia de
# fastembed) necesita símbolos de glibc 2.38+ (__isoc23_strtol y afines);
# Debian bookworm (glibc 2.36) no los tiene, por eso build y runtime usan
# trixie. También se abandona distroless aquí: fastembed/onnxruntime
# necesitan más libs del sistema de las que distroless-cc ofrece.
FROM rust:1.99.1-trixie AS build
RUN apt-get update && apt-get install -y --no-install-recommends cmake && rm -rf /var/lib/apt/lists/*
WORKDIR /src

# protobuf-src compila su propio protoc: no hace falta protoc-compiler de apt.
# Cargo.lock + --locked: sin ellos la build resolvía de cero y compilaba
# versiones más nuevas que las fijadas y probadas (fastembed 7.7.0 en vez
# de 7.6.1, por ejemplo).
#
# Caché de BuildKit para el registro y target/: sin ella cada cambio en
# Cargo.toml recompilaba todo (~8 min). CARGO_BUILD_JOBS acota el pico de
# memoria: con los 16 núcleos a la vez, compilar y enlazar ort/onnxruntime
# se comía los 7.4 GB de la VM de Docker y la tumbaba.
ARG CARGO_BUILD_JOBS=6
COPY proto /proto
COPY vector/Cargo.toml vector/Cargo.lock vector/build.rs ./
COPY vector/src ./src
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked -j ${CARGO_BUILD_JOBS} \
    && cp target/release/neo-vector /usr/local/bin/neo-vector

FROM debian:trixie-slim AS health-probe
ADD https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/v0.4.61/grpc_health_probe-linux-amd64 /grpc_health_probe
RUN chmod +x /grpc_health_probe

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/local/bin/neo-vector /neo-vector
COPY --from=health-probe /grpc_health_probe /usr/local/bin/grpc_health_probe
WORKDIR /data
EXPOSE 50051
ENTRYPOINT ["/neo-vector"]
