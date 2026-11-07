FROM rust:1.99.1-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends cmake && rm -rf /var/lib/apt/lists/*
WORKDIR /src

# protobuf-src compila su propio protoc: no hace falta protoc-compiler de apt.
COPY proto /proto
COPY vector/Cargo.toml vector/build.rs ./
COPY vector/src ./src
RUN cargo build --release

FROM debian:bookworm-slim AS health-probe
ADD https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/v0.4.61/grpc_health_probe-linux-amd64 /grpc_health_probe
RUN chmod +x /grpc_health_probe

FROM gcr.io/distroless/cc-debian12
COPY --from=build /src/target/release/neo-vector /neo-vector
COPY --from=health-probe /grpc_health_probe /usr/local/bin/grpc_health_probe
EXPOSE 50051
ENTRYPOINT ["/neo-vector"]
