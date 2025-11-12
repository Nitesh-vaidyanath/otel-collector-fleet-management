# OTel Collector Agent Fleet Management Plugin

A Grafana app plugin for managing OpenTelemetry Collector agents using the OpAMP (OpenTelemetry Agent Management Protocol) server.

## Features

- **Agent Fleet Management**: Monitor and manage multiple OpenTelemetry Collector agents
- **Configuration Management**: Create, approve, and push configurations to agents
- **Real-time Monitoring**: View pipeline flow diagrams with real-time metrics (CPU, Memory, Bandwidth, Throughput)
- **Health Monitoring**: Track agent health, status, and connectivity
- **Telemetry Data**: View historical metrics, logs, and traces from agents
- **Configuration Versioning**: Track configuration versions with approval workflow
- **Organization Support**: Organize agents by organization

## Installation

### Prerequisites

- Grafana v11.0 or later
- Node.js LTS version
- Database: MySQL, Cloud SQL, AWS RDS, or Google Cloud Spanner

### Development Setup

1. Install dependencies:
```bash
cd plugin
yarn install
```

2. Build the plugin:
```bash
yarn build
```

3. Start Grafana with Docker:
```bash
docker compose up
```

4. Access Grafana at `http://localhost:3000` and navigate to **Apps** → **OTel Collector Agent Fleet Management**

## Configuration

See [Backend Configuration Guide](../BACKEND_CONFIG.md) for detailed configuration instructions.

### Quick Start

1. Configure the plugin in Grafana UI:
   - Go to **Administration** → **Plugins** → **OTel Collector Agent Fleet Management**
   - Configure database connection settings
   - Set OpAMP server endpoint (default: `0.0.0.0:4321`)

2. Or use provisioning:
```yaml
# provisioning/plugins/otel-collector-agent-fleet-management.yaml
apiVersion: 1

 plugins:
  - name: otel-collector-agent-fleet-management
    type: app
    enabled: true
    jsonData:
      dbType: mysql
      dbHost: localhost
      dbPort: 3306
      dbName: grafana_agents
      dbUser: grafana
      opampEndpoint: 0.0.0.0:4321
    secureJsonData:
      dbPassword: your_password_here
```

## Telemetry overlays

The Monitoring tab can render live usage data straight from your observability stack.

### Metrics overlays & stage throughput

1. Click **Configure metrics overlays**.
2. Pick a Prometheus/Mimir datasource.
3. Adjust the default queries to match your labels (placeholders such as `$collector_uid`, `$pipeline`, and `$stage` are replaced automatically).
4. The defaults target the builtin collector metrics that every agent exposes:
   - `otelcol_process_cpu_seconds_total`, `otelcol_process_memory_rss_bytes`
   - `otelcol_processor_incoming_items_total`, `otelcol_processor_outgoing_items_total`
   - `otelcol_receiver_accepted_log_records_total`, `otelcol_receiver_failed_log_records_total`
   - `otelcol_exporter_sent_log_records_total`, `otelcol_exporter_send_failed_log_records_total`

When enabled, each pipeline card displays CPU/memory/throughput gauges plus per-stage Inbound/Outbound chips for every receiver, processor, and exporter.

### Log snapshots

1. Open **Configure log snapshots**.
2. Select a Loki datasource and provide a query template (supports `$collector_uid`, `$collector_name`, `$org_name`).
3. The Monitoring tab fetches the latest 50 log lines on demand.

If no datasource is configured, the UI shows a friendly placeholder and a quick link to the configuration drawer.

## Project Structure

```
plugin/
├── src/
│   ├── module.ts          # Plugin entry point
│   ├── pages/
│   │   └── App.tsx        # Main application component
│   ├── plugin.json        # Plugin manifest
│   └── scripts/
│       └── build.js       # Build script
├── tests/
│   └── e2e/
│       └── plugin.spec.ts # E2E tests
└── README.md
```

## Development

### Building

```bash
yarn build
```

### Running E2E Tests

```bash
npm run test:e2e
```

### Development Workflow

1. Make changes to source files in `src/`
2. Build the plugin: `yarn build`
3. Restart Grafana or reload the plugin page
4. Changes will be reflected immediately

## API Reference

See [API Specification](../API_SPEC.md) for complete API documentation.

## Signing and Publishing

### Signing the Plugin

1. Generate an Access Policy token in Grafana Cloud:
   - Go to **My Account** → **Security** → **Access Policies**
   - Create a policy with scope: `plugins:write`
   - Create a token

2. Sign the plugin:
```bash
npx @grafana/create-plugin@latest plugin:sign
```

3. Enter your Access Policy token when prompted

### Publishing

See [Grafana Plugin Publishing Guide](https://grafana.com/developers/plugin-tools/publish-a-plugin/publish-a-plugin) for instructions.

## Troubleshooting

### Plugin Not Loading

1. Check Grafana logs: `/var/log/grafana/grafana.log`
2. Verify plugin is enabled: **Administration** → **Plugins**
3. Check plugin permissions in `plugin.json`

### Database Connection Issues

1. Verify database credentials in plugin settings
2. Check database is accessible from Grafana server
3. Review [Backend Configuration Guide](../BACKEND_CONFIG.md)

### OpAMP Server Not Starting

1. Check OpAMP endpoint configuration
2. Verify port 4321 is not in use
3. Check firewall rules allow connections

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests
5. Submit a pull request

## License

See LICENSE file for details.

## Resources

- [OpAMP Specification](https://github.com/open-telemetry/opamp-spec)
- [OpenTelemetry Collector Documentation](https://opentelemetry.io/docs/collector/)
- [Grafana Plugin Development](https://grafana.com/developers/plugin-tools/)
- [API Specification](../API_SPEC.md)
- [Backend Configuration](../BACKEND_CONFIG.md)
