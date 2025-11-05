# Test Agents for OTel Collector Agent Fleet Management

This directory contains test OpenTelemetry Collector agents that connect to the OpAMP server.

## Quick Start

### Using Official OpAMP Supervisor (Recommended)

The **official OpAMP Supervisor** is the recommended way to manage collectors. It handles lifecycle, config application, and reporting automatically.

**Docker:**
```bash
docker compose -f docker-compose.with-supervisor.yml up -d
docker compose -f docker-compose.with-supervisor.yml logs -f
```

**macOS Native:**
```bash
./test-supervisor-macos.sh
```

**Full Documentation:** See [SUPERVISOR_SETUP.md](./SUPERVISOR_SETUP.md)

### Simple Test Agents (Without OpAMP)

For basic testing without OpAMP management:

```bash
docker compose -f docker-compose.test-agents.yml up -d
```

## Files

### Core Files
- `supervisor-config.yaml` - OpAMP Supervisor configuration
- `docker-compose.with-supervisor.yml` - Docker setup with official supervisor
- `Dockerfile.with-supervisor` - Dockerfile for supervisor-based agent
- `test-supervisor-macos.sh` - macOS native setup script

### Agent Configurations
- `agent1-config.yaml` - Test agent 1 configuration
- `agent2-config.yaml` - Test agent 2 configuration
- `agent3-config.yaml` - Test agent 3 configuration

### Documentation
- `SUPERVISOR_SETUP.md` - Complete guide for supervisor setup (Docker, macOS, VMware)
- `SUPERVISOR_EXPLAINED.md` - Detailed explanation of what supervisor manages
- `NETWORK_EXPLANATION.md` - Network communication explained
- `kubernetes/README.md` - Kubernetes setup with OpAMP Bridge and Operator

### Test Scripts
- `test-supervisor-flow.sh` - Test official supervisor approach
- `test-simple-agents-flow.sh` - Test basic agents without supervisor
- `test-all-flows.sh` - Run all test scripts
- `test-supervisor-macos.sh` - macOS native supervisor setup

## Architecture

The OpAMP Supervisor:
- Connects to OpAMP server at `ws://localhost:4321/v1/opamp` (or `ws://host.docker.internal:4321/v1/opamp` in Docker)
- **Manages the Collector PROCESS** (start/stop/restart the `otelcol-contrib` binary)
- Receives and applies RemoteConfig from server
- Reports agent status, health, and effective configuration

**Important**: The supervisor manages the **collector process**, NOT Docker containers. If running in Docker, the supervisor restarts the collector inside the container, but Docker Compose manages container restarts.

See [SUPERVISOR_EXPLAINED.md](./SUPERVISOR_EXPLAINED.md) for detailed explanation.

## Requirements

- Grafana running with OpAMP server enabled (port 4321)
- For Docker: Docker and Docker Compose
- For macOS: Homebrew (optional, for collector) or download binaries manually

## Troubleshooting

### OpAMP server not found
- Ensure Grafana is running: `curl http://localhost:3000/api/health`
- Check OpAMP server: `curl http://localhost:4321/v1/opamp` (should return connection info)
- For Docker: Use `host.docker.internal` instead of `localhost`

### Supervisor won't connect
- Verify supervisor config endpoint matches your OpAMP server URL
- Check network connectivity
- Review supervisor logs in storage directory

### Collector not starting
- Verify collector binary path in supervisor config
- Check supervisor logs for errors
- Ensure collector binary is executable
