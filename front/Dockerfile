# web: build estático con Vite (Node) servido por nginx, que además hace de
# proxy hacia neo-api para /api y /healthz (mismo origen: sin CORS).

FROM node:24.22.2-bookworm-slim AS build
WORKDIR /app
# Solo manifiestos primero: la capa de npm ci se reutiliza mientras no cambien.
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
# tsc --noEmit + vite build: si no tipa, la imagen no se construye.
RUN npm run build

FROM nginx:1.30.6-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
