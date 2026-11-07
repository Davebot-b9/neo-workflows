FROM python:3.12.9-slim-bookworm

WORKDIR /app

RUN pip install --no-cache-dir uv==0.13.7

COPY pyproject.toml ./
RUN uv pip install --system --no-cache \
    grpcio==1.85.1 grpcio-tools==1.85.1 grpcio-health-checking==1.85.1 protobuf==7.36.2

COPY neo_model ./neo_model

ADD https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/v0.4.61/grpc_health_probe-linux-amd64 /usr/local/bin/grpc_health_probe
RUN chmod +x /usr/local/bin/grpc_health_probe

EXPOSE 50052

ENV NEO_MODEL_GRPC_ADDR=[::]:50052

CMD ["python", "-m", "neo_model.server"]
