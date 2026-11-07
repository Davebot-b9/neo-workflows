FROM golang:1.27.3-bookworm AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/neo ./cmd/neo

FROM gcr.io/distroless/static-debian12
COPY --from=build /out/neo /neo
EXPOSE 8080
ENTRYPOINT ["/neo"]
