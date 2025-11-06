# OTel Collector Agent Fleet Management

A comprehensive Grafana app plugin for managing OpenTelemetry Collector agents using the OpAMP (OpenTelemetry Agent Management Protocol) server.

**Author**: Nitesh Vaidyanath  
**Email**: niteshbv@ymail.com  

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone <repository-url>
cd otel-collector-fleet-management

# 2. Build the plugin
make build-plugin

# 3. Start services
make docker-up

# 4. Access Grafana
# Navigate to http://localhost:3000
# Login: admin/admin
# Go to Apps → OTel Collector Agent Fleet Management
```

## 📋 Overview

This plugin provides a complete solution for managing fleets of OpenTelemetry Collector agents:

- **🎯 Agent Management**: Monitor, configure, and manage OTel Collector agents
- **⚙️ Configuration Management**: Create, approve, version, and push configurations
- **📊 Real-time Monitoring**: Pipeline flow diagrams with live metrics
- **📈 Telemetry Data**: View metrics, logs, and traces from agents
- **🏢 Multi-tenant**: Organization-based agent organization

## ✨ Features

### Agent Management
- Monitor agent health and status in real-time
- Track agent connectivity and uptime
- View agent capabilities and version information
- Organize agents by organization
- Filter and search agents by labels
- Secure WSS (WebSocket Secure) connections with TLS/SSL

### Configuration Management
- Visual configuration builder
- Configuration approval workflow
- Version control and history
- Push configurations to agents via OpAMP
- Revert to previous configurations
- Configuration diff and comparison
- Template management

### Real-time Monitoring
- Pipeline flow diagrams (receivers → processors → exporters)
- Real-time metrics (CPU, Memory, Bandwidth, Throughput)
- Component-level metrics
- Agent resource usage
- Animated data flow visualization

### Telemetry Data
- View historical metrics, logs, and traces
- Filter and search telemetry data
- Group by type (Metrics, Logs, Traces)
- Agent activity logs

## 📁 Project Structure

```
grafana-agents-app/
├── plugin/                    # Grafana plugin frontend
│   ├── src/                  # React/TypeScript source
│   └── tests/                # E2E tests
├── opamp-server/             # OpAMP server backend (shared codebase)
│   ├── pkg/backend/          # All backend code (plugin + standalone)
│   │   ├── main.go          # Plugin backend entry
│   │   ├── main_standalone.go # Standalone server entry
│   │   ├── handlers.go      # HTTP handlers (shared)
│   │   ├── opamp.go         # OpAMP logic (shared)
│   │   └── ...              # Other shared files
│   └── pkg/migrations/      # Database migrations
├── docs/                     # Documentation
├── docker-compose.yml        # Standard deployment
└── docker-compose.standalone.yml # Standalone OpAMP deployment
```

**Note**: All backend code is consolidated in `opamp-server/pkg/backend/`. Both plugin backend and standalone server use the same codebase via Go build tags.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Grafana Plugin (Frontend)                              │
│  - React/TypeScript UI                                  │
│  - Agent Management Interface                           │
│  - Configuration Builder                                │
│  - Monitoring Dashboard                                 │
└──────────────┬──────────────────────────────────────────┘
               │
               │ HTTP API (/api/plugins/.../resources/*)
               │
┌──────────────▼──────────────────────────────────────────┐
│  Plugin Backend (Go)                                    │
│  - REST API Handlers                                    │
│  - OpAMP Server (Embedded or External)                 │
│  - RBAC Middleware                                      │
│  - Database Access                                      │
└──────────────┬──────────────────────────────────────────┘
               │
               │ OpAMP Protocol (WebSocket/gRPC)
               │
┌──────────────▼──────────────────────────────────────────┐
│  OpenTelemetry Collector Agents                         │
│  - Receive configurations                               │
│  - Report health and telemetry                          │
│  - Send metrics/logs/traces                              │
└─────────────────────────────────────────────────────────┘
```

## 📦 Installation

### Prerequisites

- **Grafana**: v11.0 or later
- **Node.js**: LTS version (for plugin development)
- **Go**: 1.21 or later (for backend development)
- **Database**: MySQL 8.0+, Cloud SQL, AWS RDS, or Cloud Spanner

### Installation Steps

1. **Build the plugin**:
   ```bash
   make build-plugin
   ```

2. **Start services**:
   ```bash
   make docker-up
   ```

3. **Run database migrations**:
   ```bash
   ./run-migrations.sh
   ```

4. **Access Grafana**:
   - URL: http://localhost:3000
   - Login: admin/admin
   - Navigate to **Apps** → **OTel Collector Agent Fleet Management**

## ⚙️ Configuration

### Plugin Configuration

Configure the plugin through Grafana UI or via provisioning:

**Via Grafana UI**:
1. Go to **Configuration** → **Plugins** → **OTel Collector Agent Fleet Management**
2. Configure database connection
3. Set OpAMP server mode (embedded or external)

**Via Provisioning**:
```yaml
# provisioning/plugins/otel-collector-agent-fleet-management.yaml
apiVersion: 1

plugins:
  - name: otel-collector-agent-fleet-management
    type: app
    enabled: true
    jsonData:
      dbType: mysql
      dbHost: mysql
      dbPort: 3306
      dbName: grafana_agents
      dbUser: grafana
      opampServerMode: embedded
      opampEndpoint: 0.0.0.0:4321
    secureJsonData:
      dbPassword: grafana123
```

### OpAMP Server Modes

**Embedded Mode** (default):
- OpAMP server runs inside the plugin backend
- Simple setup, single process
- Good for development and small deployments

**External Mode**:
- OpAMP server runs as a separate service
- Better for production, scaling, and high availability
- See [Standalone OpAMP Setup](./docs/STANDALONE_OPAMP_SETUP.md)

**Configuration Details**: See [Plugin Configuration Guide](./docs/PLUGIN_CONFIGURATION.md)

## 📚 Documentation

All documentation is organized in the [`docs/`](./docs/) folder. See [Documentation Index](./docs/README.md) for complete list.

### Quick Links

- **[Plugin Configuration Guide](./docs/PLUGIN_CONFIGURATION.md)** ⭐ - Complete guide to plugin settings, `backend: true`, OpAMP modes, and configuration
- **[WSS/TLS Setup Guide](./docs/WSS_TLS_SETUP.md)** 🔒 - Enable secure WebSocket connections with TLS/SSL
- **[API Specification](./docs/API_SPEC.md)** - Complete REST API reference
- **[Backend Configuration](./docs/BACKEND_CONFIG.md)** - Database setup (MySQL, Cloud SQL, RDS, Spanner)
- **[Standalone OpAMP Setup](./docs/STANDALONE_OPAMP_SETUP.md)** - Running OpAMP server separately
- **[Troubleshooting](./docs/TROUBLESHOOTING.md)** - Common issues and solutions

For complete documentation, see [docs/README.md](./docs/README.md).

## 🔧 Development

### Build Commands

```bash
# Build everything
make build

# Build backend only
make build-backend

# Build frontend only
make build-frontend

# Build standalone OpAMP server
make build-standalone
```

### Running Locally

```bash
# Start development environment
make dev-up

# Stop development environment
make dev-down

# View logs
docker compose logs -f grafana
```

### Testing

```bash
# Run all tests
make test

# Run unit tests
make test-unit

# Run E2E tests
make test-e2e

# Test OpAMP agent connections
make test-opamp
```

## 🐳 Docker Deployment

### Standard Deployment (Embedded OpAMP)

```bash
# Start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f grafana
```

### Standalone OpAMP Deployment

```bash
# Build and start standalone OpAMP server
make standalone-up

# Stop standalone services
make standalone-down
```

See [Standalone OpAMP Setup](./docs/STANDALONE_OPAMP_SETUP.md) for details.

## 🔐 Security

- **Database Passwords**: Stored encrypted in `secureJsonData`
- **RBAC**: Role-based access control for API endpoints
- **TLS Support**: Optional TLS for OpAMP server (via reverse proxy)
- **Environment Variables**: Sensitive values via environment variables

## 📊 Database Support

- **MySQL**: Standard MySQL 8.0+
- **Google Cloud SQL**: Direct TCP connection or Unix socket
- **AWS RDS**: MySQL-compatible with SSL support
- **Google Cloud Spanner**: Fully managed database

See [Backend Configuration](./docs/BACKEND_CONFIG.md) for detailed setup.

## 🚨 Troubleshooting

### Common Issues

**Plugin not loading**:
- Check Grafana logs: `docker compose logs grafana`
- Verify plugin is enabled in Grafana UI
- Check plugin permissions

**Database connection errors**:
- Verify database credentials in plugin settings
- Check database is accessible from Grafana
- Review [Backend Configuration](./docs/BACKEND_CONFIG.md)

**OpAMP server not starting**:
- Check OpAMP endpoint configuration
- Verify port 4321 is not in use
- Check firewall rules
- Review [OpAMP Server Setup](./docs/OPAMP_SERVER_SETUP.md)

**Agents not connecting**:
- Verify OpAMP server URL is correct
- Check network connectivity
- Verify OpAMP server is running
- Check agent configuration

**OpAMP Bridge + DaemonSet mode**:
- ⚠️ **Known Limitation**: OpAMP Bridge cannot update DaemonSet collectors due to operator webhook restrictions
- Workaround: Use `kubectl patch` to update `spec.config` manually, or use `deployment`/`statefulset` mode instead
- See [Troubleshooting Guide](./docs/TROUBLESHOOTING.md#opamp-bridge-daemonset-mode-configuration-update-failure) for details
- Related Issue: [open-telemetry/opentelemetry-operator#4481](https://github.com/open-telemetry/opentelemetry-operator/issues/4481)

For more troubleshooting help, see [Troubleshooting Guide](./docs/TROUBLESHOOTING.md).

## 📈 Features in Detail

### Agent Management
- **Health Monitoring**: Real-time status updates every 5 seconds
- **Label Filtering**: Filter agents by custom labels
- **Organization Support**: Multi-tenant agent organization
- **Activity Logs**: Track all agent activities and changes

### Configuration Management
- **Visual Builder**: Drag-and-drop configuration builder
- **YAML Editor**: Full YAML editor with syntax highlighting
- **Approval Workflow**: Admin approval required for configuration changes
- **Version History**: Track all configuration versions
- **Diff View**: Compare configurations side-by-side
- **Template Library**: Save and reuse configuration templates

### Monitoring
- **Pipeline Flow Diagram**: Visual representation of data flow
- **Real-time Metrics**: CPU, Memory, Bandwidth, Throughput
- **Component Metrics**: Per-component resource usage
- **Animated Flow**: Visual data flow animation

### Telemetry
- **Metrics**: Historical metrics data from agents
- **Logs**: Agent logs and application logs
- **Traces**: Distributed tracing data
- **Filtering**: Filter by type, time range, agent

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Write tests
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📝 License

See LICENSE file for details.

## 🔗 Resources

- [OpAMP Specification](https://github.com/open-telemetry/opamp-spec)
- [OpenTelemetry Collector Documentation](https://opentelemetry.io/docs/collector/)
- [Grafana Plugin Development](https://grafana.com/developers/plugin-tools/)
- [Grafana Plugin Signing](https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin)
- [Grafana Plugin Publishing](https://grafana.com/developers/plugin-tools/publish-a-plugin/publish-a-plugin)

## 📧 Support

For issues and questions:
- **GitHub Issues**: [https://github.com/nitesh-bv/grafana-agents-app/issues](https://github.com/nitesh-bv/grafana-agents-app/issues)
- **Documentation**: See [docs](./docs/) folder for detailed guides
- **Email**: niteshbv@ymail.com

## 📖 Documentation

See [Documentation Index](./docs/README.md) for complete documentation.

**Essential Guides**:
- **[Plugin Configuration](./docs/PLUGIN_CONFIGURATION.md)** - How plugin settings work, `backend: true`, OpAMP modes
- **[API Specification](./docs/API_SPEC.md)** - Complete API reference
- **[Backend Configuration](./docs/BACKEND_CONFIG.md)** - Database setup
- **[Standalone OpAMP](./docs/STANDALONE_OPAMP_SETUP.md)** - Running OpAMP separately
- **[Troubleshooting](./docs/TROUBLESHOOTING.md)** - Common issues and solutions

---

**Made with ❤️ by Nitesh Vaidyanath**
