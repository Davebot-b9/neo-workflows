# Imagen oficial de PyTorch con CUDA 13.2 ya instalado y enlazado a la GPU
# correctamente. No reinstalamos torch/torchvision desde PyPI: el índice
# público de PyPI da ruedas CPU-only para versiones recientes, y
# sobrescribir el torch+CUDA de esta imagen rompería silenciosamente la GPU.
FROM pytorch/pytorch:2.15.0-cuda13.2-cudnn9-runtime

WORKDIR /app

# git: pip lo necesita para clonar qev desde GitHub (no está en PyPI, ver abajo).
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# --break-system-packages: esta imagen protege el Python del sistema (PEP
# 668), pero el contenedor es de un solo uso, no hay nada más que proteger.
RUN pip install --no-cache-dir --break-system-packages \
    grpcio==1.85.1 grpcio-tools==1.85.1 grpcio-health-checking==1.85.1 protobuf==7.36.2 \
    transformers==5.22.2 accelerate==1.15.0 safetensors==0.8.0 peft==0.21.2 \
    pydantic==2.14.3 jinja2==3.1.6 pillow==13.0.0 fastapi==0.162.2 uvicorn==0.54.0

# --no-deps: qev pide torch/torchvision por su cuenta (extra [torch]), pero
# ya vienen correctos en la imagen base; instalar solo el paquete evita que
# pip intente "resolver" y termine bajando un torch sin CUDA.
RUN pip install --no-cache-dir --break-system-packages --no-deps \
    "qev @ git+https://github.com/OmniJev/OneJev.git@31678bc3ad1c980a9e416e4902cd2e4c8ffc02f5"

COPY neo_model ./neo_model

ADD https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/v0.4.61/grpc_health_probe-linux-amd64 /usr/local/bin/grpc_health_probe
RUN chmod +x /usr/local/bin/grpc_health_probe

# El modelo (~2.2GB) se baja de Hugging Face al primer arranque y se cachea
# aquí; compose.yaml monta un volumen en /data para no repetirlo. WORKDIR
# se queda en /app (ahí vive el paquete neo_model); /data es solo caché.
ENV HF_HOME=/data/.hf_cache

EXPOSE 50052

ENV NEO_MODEL_GRPC_ADDR=[::]:50052

CMD ["python", "-m", "neo_model.server"]
