# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /build

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY pkg/ ./pkg/

# Build for linux/amd64
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o plugin_linux_amd64 ./pkg/backend

# Final stage
FROM alpine:latest

WORKDIR /app

# Copy binary from builder
COPY --from=builder /build/plugin_linux_amd64 ./plugin_linux_amd64

# Create symlinks expected by Grafana packaging
RUN ln -sf plugin_linux_amd64 plugin && \
    ln -sf plugin_linux_amd64 _linux_amd64

# The plugin binary will be executed by Grafana
CMD ["./plugin_linux_amd64"]

