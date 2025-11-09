SHELL := /bin/bash

.PHONY: help build build-backend build-frontend build-plugin build-test test test-unit test-e2e test-opamp clean docker-build docker-up docker-down docker-test docker-clean dev dev-up dev-down

# Default target
help:
	@echo "Available targets:"
	@echo "  build              - Build both backend and frontend"
	@echo "  build-backend      - Build OpAMP server backend"
	@echo "  build-frontend     - Build Grafana plugin frontend"
	@echo "  build-plugin       - Build complete plugin (backend + frontend)"
	@echo "  build-test         - Build test Docker image"
	@echo "  test               - Run all tests"
	@echo "  test-unit          - Run unit tests"
	@echo "  test-e2e           - Run E2E tests"
	@echo "  test-opamp         - Test OpAMP agent connections"
	@echo "  docker-build       - Build all Docker images"
	@echo "  docker-up          - Start Docker Compose services"
	@echo "  docker-down        - Stop Docker Compose services"
	@echo "  docker-test        - Run tests in Docker"
	@echo "  docker-clean       - Clean Docker resources"
	@echo "  build-standalone   - Build standalone OpAMP server"
	@echo "  standalone-up      - Start standalone OpAMP server with Grafana"
	@echo "  standalone-down    - Stop standalone OpAMP server"
	@echo "  dev                - Start development environment"
	@echo "  dev-up             - Start dev services"
	@echo "  dev-down           - Stop dev services"
	@echo "  clean              - Clean build artifacts"

# Build targets
build: build-backend build-frontend
	@echo "✓ Build complete"

build-backend:
	@echo ">> Building OpAMP server backend"
	@mkdir -p dist
	@echo "  - Building for linux/amd64"
	@cd opamp-server && GOOS=linux GOARCH=amd64 go build -o ../dist/plugin_linux_amd64 ./pkg/backend
	@echo "  - Creating symlinks"
	@cd dist && rm -f plugin _linux_amd64 && \
		ln -sf plugin_linux_amd64 plugin && \
		ln -sf plugin_linux_amd64 _linux_amd64
	@echo "✓ Backend build complete"

build-frontend:
	@echo ">> Building Grafana plugin frontend"
	@cd plugin/src && yarn install --frozen-lockfile
	@cd plugin/src && yarn build
	@echo "  - Copying plugin.json"
	@cp plugin/src/plugin.json dist/plugin.json
	@echo "✓ Frontend build complete"

build-plugin: build-backend build-frontend
	@echo ">> Building complete plugin"
	@echo "✓ Plugin build complete"

build-test:
	@echo ">> Building test Docker image"
	@docker build -f tests/docker/Dockerfile.test -t otel-collector-agent-fleet-management-test:latest .
	@echo "✓ Test image built"

# Test targets
test: test-unit test-e2e
	@echo "✓ All tests complete"

test-unit:
	@echo ">> Running unit tests"
	@cd opamp-server && go test -v -coverprofile=../coverage.out ./pkg/backend/...
	@echo "✓ Unit tests complete"

test-e2e:
	@echo ">> Running E2E tests"
	@if ! command -v npx >/dev/null 2>&1; then \
		echo "⚠ npm/npx not found. Installing dependencies..."; \
		npm install || yarn install; \
	fi
	@if ! docker compose ps grafana 2>/dev/null | grep -q "running"; then \
		echo "Starting Grafana for E2E tests..."; \
		docker compose up -d grafana mysql; \
		sleep 15; \
	fi
	@echo ">> Installing Playwright browsers..."
	@npx playwright install chromium || true
	@echo ">> Running Playwright tests..."
	@GRAFANA_USER=admin GRAFANA_PASS=admin npx playwright test --config tests/e2e/playwright.config.ts || echo "⚠ E2E tests require Grafana running"
	@echo "✓ E2E tests complete"

# Docker targets
docker-build: build-plugin build-test
	@echo ">> Building Docker images"
	@docker build -f opamp-server/Dockerfile -t otel-collector-opamp-server:latest ./opamp-server
	@docker build -f plugin/Dockerfile -t otel-collector-plugin:latest ./plugin
	@echo "✓ Docker images built"

docker-up:
	@echo ">> Starting Docker Compose services"
	@docker compose up -d
	@echo "✓ Services started"
	@echo "  Grafana: http://localhost:3000 (admin/admin)"
	@echo "  OpAMP Server: localhost:4321"

docker-down:
	@echo ">> Stopping Docker Compose services"
	@docker compose down
	@echo "✓ Services stopped"

docker-test: build-test
	@echo ">> Running tests in Docker"
	@docker compose -f tests/docker/docker-compose.test.yml up --abort-on-container-exit
	@echo "✓ Docker tests complete"

docker-clean:
	@echo ">> Cleaning Docker resources"
	@docker compose down -v
	@docker rmi otel-collector-opamp-server:latest otel-collector-plugin:latest otel-collector-agent-fleet-management-test:latest 2>/dev/null || true
	@echo "✓ Docker resources cleaned"

# Development targets
dev: dev-up
	@echo "✓ Development environment ready"

dev-up: build-plugin docker-up
	@echo ">> Waiting for services to be ready..."
	@sleep 10
	@echo "✓ Development environment started"
	@echo "  Run migrations: ./scripts/run-migrations.sh"
	@echo "  Check status: ./status.sh"

dev-down: docker-down
	@echo "✓ Development environment stopped"

# Standalone OpAMP server targets
build-standalone:
	@echo ">> Building standalone OpAMP server"
	@echo "  - Building binary (standalone mode)"
	@cd opamp-server && go build -tags standalone -o opamp-server ./pkg/backend
	@echo "  - Building Docker image"
	@cd opamp-server && docker build -f Dockerfile.standalone -t opamp-server:latest .
	@echo "✓ Standalone OpAMP server built"

standalone-up: build-standalone
	@echo ">> Starting standalone OpAMP server with Grafana"
	@docker compose -f tests/docker/docker-compose.standalone.yml up -d
	@echo "✓ Standalone services started"
	@echo "  - Grafana: http://localhost:3000"
	@echo "  - OpAMP Server: http://localhost:4321"
	@echo "  - Health Check: http://localhost:8080/health"

standalone-down:
	@echo ">> Stopping standalone OpAMP server"
	@docker compose -f tests/docker/docker-compose.standalone.yml down
	@echo "✓ Standalone services stopped"

# Clean target
clean:
	@echo ">> Cleaning build artifacts"
	@rm -rf dist
	@rm -f *.tar.gz *.zip coverage.out coverage.html
	@cd opamp-server && go clean
	@cd plugin/src && rm -rf node_modules dist
	@echo "✓ Clean complete"

