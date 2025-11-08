# Loopback Proxy Architecture

This document explains all of the changes that were made to keep the plugin working on Grafana&nbsp;11.x (where `CallResource` requests to `/api/plugins/:id/resources/*` are redirected away from the backend) and describes the new loopback/proxy flow.

## Why the change was required

Grafana&nbsp;11 introduced an internal router update that canonicalizes `/api/plugins/:id/resources/*` before the request is forwarded to the backend. In practice the request never reaches the plugin and we only see HTML 404 responses inside the UI (`Unexpected token '<'`). Because this happens inside Grafana, there was no way to fix it in the plugin code alone.

To keep the UI functional we now:

1. Expose the backend HTTP handler through a dedicated listener (`loopback_server`), outside of Grafana’s CallResource lifecycle.
2. Register plugin proxy routes that map `/api/plugin-proxy/otel-collector-agent-fleet-management/plugin-api/*` to that listener.
3. Update the frontend to normalize every request through the proxy when running inside Grafana, while still supporting the old `/plugin-api` path for standalone smoke testing.

## High-level flow

```text
Grafana UI
   |
   |  /api/plugin-proxy/otel-collector-agent-fleet-management/plugin-api/agents
   v
Grafana Proxy
   |
   |  (routes entry in plugin.json)
   v
fleet-backend (loopback server, port 5801)
   |
   |  /plugin-api/agents -> opamp-server/pkg/backend HTTP mux
   v
Database / OpAMP logic
```

## Changes by file

| Area | File(s) | Purpose |
|------|---------|---------|
| Loopback binary | `opamp-server/pkg/backend/main_loopback.go`, `opamp-server/pkg/backend/globals.go`, `opamp-server/Dockerfile.loopback` | Introduces a standalone entry-point that starts the original HTTP mux plus the OpAMP server and listens on `LOOPBACK_LISTEN_ADDR` (default `0.0.0.0:5801`). |
| Docker topology | `docker-compose.yml` | Builds and runs a new `fleet-backend` service (from `Dockerfile.loopback`) alongside Grafana/MySQL and exposes `5801` plus the OpAMP port. Grafana now depends on this service. |
| Plugin manifest | `plugin/src/plugin.json` | Adds proxy `routes` for all HTTP verbs: `path: "plugin-api/*"` maps to `http://fleet-backend:5801/plugin-api`. |
| Frontend | `plugin/src/pages/App.tsx` | All API calls now use the normalized `backendSrv` wrapper. When running inside Grafana the wrapper automatically targets `/api/plugin-proxy/<id>/plugin-api/*`. The Monitoring tab no longer re-initializes `backendSrv`, so it also goes through the proxy. |
| Backend entry point | `opamp-server/pkg/backend/main.go`, `opamp-server/pkg/backend/resource_adapter.go` | The CallResource handler is still registered (for standalone mode and older Grafana versions), but plugin traffic normally bypasses it via the proxy. |
| Provisioning | `provisioning/plugins/otel-collector-agent-fleet-management-auto-enable.yaml` | Updated with the correct DSN (`mysql`) and password so Grafana can auto-enable the app on startup. |

## Running locally

```bash
make build-plugin          # builds dist/ with updated module.js + plugin.json
docker compose up -d       # starts mysql, fleet-backend, grafana
docker exec grafana \
  curl -s http://fleet-backend:5801/plugin-api/health
# -> {"ok":true}
```

Grafana now serves every UI request via:
```
/api/plugin-proxy/otel-collector-agent-fleet-management/plugin-api/<endpoint>
```
so there are no more 404s or 301 redirects from the CallResource path.

## Notes & troubleshooting

- If you run Grafana on ARM hardware, ensure `dist/plugin_linux_arm64` exists (run `GOARCH=arm64` builds) because Grafana loads the backend binary for the host architecture.
- When testing via `curl` remember Grafana’s proxy still requires auth. Include either a session cookie or an API key, e.g. `curl -H "Authorization: Bearer <key>" http://localhost:3000/api/plugin-proxy/...`.
- You can temporarily fall back to the legacy CallResource path by setting `localStorage.otelFleetTransport = 'resources'` before reloading the UI, but the proxy + loopback configuration is the long-term fix.

