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

### Frontend Build & Custom Panels

Our Grafana app currently ships two frontend entry points:

1. `src/module.ts` – the main application that renders the fleet UI inside Grafana.
2. `src/panels/pipeline/module.tsx` – the reusable Pipeline Metrics panel that can be dropped onto any Grafana dashboard.

Because Grafana’s plugin loader expects **AMD/SystemJS** modules, we cannot ship raw ES modules. The build script (`src/scripts/build.js`) runs `esbuild` twice:

| Entry          | Temp Output                                | Final Output (Grafana loads this)                        |
|----------------|---------------------------------------------|----------------------------------------------------------|
| `module.ts`    | `dist/public/module.js.tmp`                 | `dist/public/module.js` and `dist/module.js`             |
| `panels/...`   | `dist/public/panels/pipeline/module.js.tmp` | `dist/public/panels/pipeline/module.js` and copies under `dist/panels/...` |

After esbuild produces an ES module it converts the file to AMD, rewrites imports such as `import React from 'react'` into AMD parameters, and removes `export` statements. Each wrapped module registers a `plugin` object that Grafana can instantiate.

To add another panel or data source module:

1. Create the TS/TSX entry file under `src/panels/**/module.tsx`.
2. Update the `entries` array in `src/scripts/build.js` with the new path so it gets bundled.
3. Add an `includes` block to `plugin/src/plugin.json` referencing the compiled path (e.g., `"module": "panels/new-panel/module"`).
4. Run `npm run build` (or `yarn build` at repo root) so `dist/**/module.js` is regenerated.
5. Restart Grafana or reload the plugin so it picks up the new AMD bundle.

> Tip: Grafana caches plugin bundles aggressively. If you change only the panel TSX file but forget to rebuild, you’ll see `Cannot use import statement outside a module` errors because Grafana is still trying to load the source file.

### Telemetry Panels (Metrics & Logs)

The **Monitoring** tab can now render real CPU/memory/bandwidth charts and a Loki log tail:

- Metrics use the in-app Pipeline Metrics panel (backed by Prometheus/Mimir queries).
- Logs use a lightweight Loki query runner.
- Both are disabled by default until an admin selects a datasource.

Configuration workflow:

1. Open the Monitoring tab, flip the `Metrics overlays` or `Log snapshots` toggle.
2. A drawer opens on the right where you can pick a datasource and edit the query templates (supports placeholders such as `$collector_uid`, `$pipeline`, `$org_name`).
3. Save the configuration – settings persist per organization (stored in `telemetry_settings` table) and apply to every agent view.
4. Re-open the drawer any time via the **Configure** button next to the toggle.

When toggled off, the UI hides the panels entirely; when toggled on without configuration, the prompts guide the user to the drawer.

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
