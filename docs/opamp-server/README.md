# OpAMP Server

OpAMP server implementation for managing OpenTelemetry Collector agents. This service provides the OpAMP protocol server and REST API endpoints for agent management.

## Features

- **OpAMP Server**: Implements the OpenTelemetry Agent Management Protocol
- **REST API**: Provides HTTP endpoints for agent and configuration management
- **Database Support**: MySQL, Cloud SQL, AWS RDS, and Google Cloud Spanner
- **Agent Health Monitoring**: Tracks agent status and connectivity
- **Configuration Management**: Handles configuration versioning and approval workflow

## Project Structure

```
opamp-server/
├── pkg/
│   ├── backend/
│   │   ├── main.go         # Entry point and OpAMP server setup
│   │   ├── http.go         # HTTP router and handlers
│   │   ├── handlers.go     # Request handlers
│   │   ├── opamp.go        # OpAMP server implementation
│   │   ├── logger.go       # Logging utilities
│   │   └── rbac.go         # RBAC middleware
│   └── migrations/         # Database migration files
├── go.mod                  # Go module dependencies
└── README.md
```

## Configuration

The backend service is configured through the Grafana plugin settings. See [Backend Configuration Guide](../BACKEND_CONFIG.md) for details.

### Environment Variables

```bash
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=grafana_agents
DB_USER=grafana
DB_PASSWORD=your_password
OPAMP_ENDPOINT=0.0.0.0:4321
# Logging (optional)
LOG_LEVEL=info          # debug | info | warn | error
LOG_FORMAT=text         # json | text
```

### Logging Configuration

Logging can be tuned via environment variables or at runtime:

| Option | Description |
| --- | --- |
| `LOG_LEVEL` | Set to `debug`, `info`, `warn`, or `error`. Defaults to `info`. |
| `LOG_FORMAT` | Set to `json` for structured logs or `text` (default). `JSON_LOGGING=true` is also supported for backwards compatibility. |
| `LOG_DEBUG` / `DEBUG` | Setting either to `true` is equivalent to `LOG_LEVEL=debug`. |

At runtime you can query or update logging with the `/logging` API (admin role required for updates):

```
GET  /api/plugins/otel-collector-agent-fleet-management/resources/logging
POST /api/plugins/otel-collector-agent-fleet-management/resources/logging
```

Example payload:

```json
{
  "level": "debug",
  "jsonLogging": true
}
```

## Building

### Prerequisites

- Go 1.21 or later
- Database (MySQL, Cloud SQL, AWS RDS, or Spanner)

### Build for Linux AMD64

```bash
cd opamp-server
GOOS=linux GOARCH=amd64 go build -o plugin_linux_amd64 ./pkg/backend
```

### Build for Linux ARM64

```bash
cd opamp-server
# Optional: build for other architectures (not packaged by default)
# GOOS=linux GOARCH=arm64 go build -o plugin_linux_arm64 ./pkg/backend
```

## Database Migrations

Migrations are automatically applied when the plugin starts. To run migrations manually:

```bash
go run cmd/migrate/main.go
```

## API Endpoints

See [API Specification](../API_SPEC.md) for complete API documentation.

## OpAMP Protocol

The backend implements the OpAMP server protocol. Agents connect to the OpAMP endpoint to:

- Report health and status
- Receive configuration updates
- Report telemetry data

### OpAMP Capabilities

The server advertises the following capabilities:

- `AcceptsOwnMetrics`: Server accepts metrics from agents
- `OffersOwnMetrics`: Server provides metrics to agents
- `AcceptsOwnTraces`: Server accepts traces from agents
- `OffersOwnTraces`: Server provides traces to agents
- `AcceptsOwnLogs`: Server accepts logs from agents
- `OffersOwnLogs`: Server provides logs to agents

## Development

### Running Locally

1. Set environment variables
2. Start the service:
```bash
cd opamp-server
go run ./pkg/backend
```

### Testing

```bash
cd opamp-server
go test -v ./pkg/backend/...
```

## Deployment

The backend service is bundled with the Grafana plugin and runs as a plugin backend process. Grafana manages the lifecycle of the backend process.

## Troubleshooting

### Database Connection Issues

1. Verify database credentials
2. Check database is accessible
3. Review connection pool settings

### OpAMP Server Issues

1. Check OpAMP endpoint configuration
2. Verify port is not in use
3. Check firewall rules

### Migration Issues

1. Check database permissions
2. Verify database exists
3. Review migration files

## License

See LICENSE file for details.

## Resources

- [OpAMP Specification](https://github.com/open-telemetry/opamp-spec)
- [OpenTelemetry Collector Documentation](https://opentelemetry.io/docs/collector/)
- [API Specification](../API_SPEC.md)
- [Backend Configuration Guide](../BACKEND_CONFIG.md)
