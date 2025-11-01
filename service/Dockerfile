FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod ./
RUN apk add --no-cache git
ENV GOTOOLCHAIN=go1.23.0
RUN go env -w GOPROXY=https://proxy.golang.org,direct && go mod download -x || true
COPY . .
RUN go mod tidy && go mod download -x || true
RUN mkdir -p /out \
 && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/berjis-cribs ./cmd/service

FROM gcr.io/distroless/base-debian12
WORKDIR /
COPY --from=build /out/berjis-cribs /berjis-cribs
COPY --from=build /app/migrations /migrations
EXPOSE 8095
USER 65532:65532
ENTRYPOINT ["/berjis-cribs"]
