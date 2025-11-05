# Build stage
FROM node:18-alpine AS builder

WORKDIR /build

# Copy package files
COPY src/package.json src/yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy source code
COPY src/ ./

# Build plugin
RUN yarn build

# Final stage
FROM alpine:latest

WORKDIR /app

# Copy built files
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/plugin.json ./plugin.json

# The plugin files will be used by Grafana
CMD ["sh", "-c", "echo 'Plugin built successfully'"]

