# Plugin Configuration Guide

## Understanding `plugin.json` Configuration

This guide explains how the plugin configuration works, what each field means, and how to configure it properly.

## Table of Contents

- [What is `backend: true`?](#what-is-backend-true)
- [Configuration Fields Explained](#configuration-fields-explained)
- [How Configuration Works](#how-configuration-works)
- [Configuration Flow](#configuration-flow)
- [Caveats and Limitations](#caveats-and-limitations)
- [Best Practices](#best-practices)

## What is `backend: true`?

The `"backend": true` field tells Grafana that this plugin has server-side code (Go backend) in addition to the frontend (React UI).

### What Happens When `backend: true` is Set?

1. **Grafana launches a backend process** when the plugin is enabled
2. **Looks for executable file**: `plugin` (symlinked to `plugin_linux_amd64`)
3. **Routes API requests** from frontend to backend via `/api/plugins/{plugin-id}/resources/*`
4. **Manages backend lifecycle**: Starts, stops, and restarts the backend process

### Why This Plugin Needs Backend

This plugin requires `backend: true` because it:

- **Runs OpAMP Server**: Manages agent connections via OpAMP protocol
- **Database Access**: Connects to MySQL/Cloud SQL/Spanner for data persistence
- **Security**: Handles sensitive database credentials securely
- **Performance**: Processes large amounts of agent data efficiently
- **Real-time Operations**: Pushes configurations to agents, receives telemetry

## Configuration Fields Explained

### OpAMP Server Mode (`opampServerMode`)

**Type**: `select`  
**Default**: `"embedded"`  
**Options**:
- `"embedded"`: OpAMP server runs inside the plugin backend
- `"external"`: OpAMP server runs as a separate standalone service

**What it does**:
- **Embedded Mode**: The plugin backend starts the OpAMP server internally on the configured endpoint
- **External Mode**: The plugin backend does NOT start OpAMP server; agents connect to a separate OpAMP server

**When to use**:
- **Embedded**: Simple deployments, single Grafana instance, development
- **External**: Production, scaling, high availability, separate infrastructure

### External OpAMP Server URL (`opampServerURL`)

**Type**: `string`  
**Default**: `"http://opamp-server:4321"`  
**Required**: Only when `opampServerMode` is `"external"`

**What it does**:
- Specifies the URL where the standalone OpAMP server is running
- Used for reference/documentation (agents connect directly to this URL)

**Format**: `http://hostname:port` or `https://hostname:port` (for TLS)

**Examples**:
- `http://opamp-server:4321` (Docker service name)
- `http://localhost:4321` (Local development)
- `https://opamp.example.com:4321` (Production with TLS)

### OpAMP Server Endpoint (`opampEndpoint`)

**Type**: `string`  
**Default**: `"0.0.0.0:4321"`  
**Required**: Only when `opampServerMode` is `"embedded"`

**What it does**:
- Specifies the address and port where the embedded OpAMP server listens
- Format: `IP:PORT` (e.g., `0.0.0.0:4321` listens on all interfaces)

**Examples**:
- `0.0.0.0:4321` - Listen on all network interfaces (recommended)
- `127.0.0.1:4321` - Listen only on localhost
- `192.168.1.100:4321` - Listen on specific IP

## How Configuration Works

### Current Implementation

**Important**: The plugin backend currently reads configuration from **environment variables**, not directly from plugin `jsonData`.

### Configuration Flow

```
┌─────────────────────────────────────────────────────────┐
│  1. User Configures in Grafana UI                        │
│     Plugin Settings → jsonData stored in Grafana DB      │
└──────────────────┬──────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│  2. Environment Variables (Current Method)             │
│     Set OPAMP_SERVER_MODE and OPAMP_SERVER_URL          │
│     in Docker Compose or system environment              │
└──────────────────┬──────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│  3. Backend Reads on Startup                            │
│     opampServerMode := os.Getenv("OPAMP_SERVER_MODE")   │
│     opampServerURL := os.Getenv("OPAMP_SERVER_URL")     │
└──────────────────┬──────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│  4. Backend Behavior                                    │
│     if mode == "external":                              │
│       - Skip starting OpAMP server                       │
│       - Only handle REST API requests                    │
│     else:                                                │
│       - Start embedded OpAMP server                      │
│       - Handle both API and OpAMP connections           │
└─────────────────────────────────────────────────────────┘
```

### Setting Configuration

#### Method 1: Docker Compose (Recommended)

```yaml
# docker-compose.yml or docker-compose.standalone.yml
grafana:
  environment:
    # Match these to plugin UI settings
    OPAMP_SERVER_MODE: "external"          # or "embedded"
    OPAMP_SERVER_URL: "http://opamp-server:4321"
    OPAMP_ENDPOINT: "0.0.0.0:4321"        # for embedded mode
```

#### Method 2: Plugin UI Settings

1. Go to **Configuration** → **Plugins** → **OTel Collector Agent Fleet Management**
2. Set `opampServerMode` to `"external"` or `"embedded"`
3. Set `opampServerURL` if using external mode
4. **Important**: Also set matching environment variables (see Method 1)

#### Method 3: Check Current Settings

```bash
# Via API endpoint
curl http://localhost:3000/api/plugins/otel-collector-agent-fleet-management/resources/settings

# Response:
{
  "opampServerMode": "external",
  "opampServerURL": "http://opamp-server:4321",
  "opampEndpoint": "0.0.0.0:4321",
  "hasOpampManager": false,
  "note": "Settings are currently read from environment variables..."
}
```

## Configuration Flow

### Embedded Mode

```
┌─────────────────────┐
│  Grafana Plugin     │
│  (Backend Process)  │
│  ┌───────────────┐  │
│  │ OpAMP Server  │  │ ← Runs on opampEndpoint
│  │ :4321         │  │
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ REST API      │  │ ← Handles /resources/* requests
│  └───────────────┘  │
└─────────────────────┘
         │
         │ OpAMP Protocol
         │
┌────────▼────────┐
│  OTel Collectors│
│  (Agents)        │
└─────────────────┘
```

**Configuration**:
```yaml
opampServerMode: "embedded"
opampEndpoint: "0.0.0.0:4321"
```

### External Mode

```
┌─────────────────────┐         ┌──────────────────┐
│  Grafana Plugin     │         │  OpAMP Server    │
│  (Backend Process)  │         │  (Standalone)    │
│  ┌───────────────┐  │         │  :4321          │
│  │ REST API Only │  │         │                 │
│  └───────────────┘  │         └─────────────────┘
└─────────────────────┘                  │
         │                                │ OpAMP Protocol
         │                                │
         └────────────────┬───────────────┘
                          │
                 ┌────────▼────────┐
                 │  OTel Collectors│
                 │  (Agents)        │
                 └─────────────────┘
```

**Configuration**:
```yaml
opampServerMode: "external"
opampServerURL: "http://opamp-server:4321"
```

**Agents connect to**: `http://opamp-server:4321/v1/opamp`

## Caveats and Limitations

### ⚠️ Important Caveats

1. **Environment Variables Required**
   - Plugin `jsonData` is stored but not automatically passed to backend
   - You must set matching environment variables
   - Backend restart required to apply changes

2. **No Dynamic Configuration**
   - Changing plugin settings in UI doesn't immediately affect backend
   - Must restart Grafana/backend for changes to take effect

3. **Two Sources of Truth**
   - Plugin UI settings (for documentation/reference)
   - Environment variables (actual backend behavior)
   - They must match for consistency

4. **Standalone Mode Limitation**
   - When using external mode, the plugin backend does NOT start OpAMP server
   - Agents must connect to the standalone OpAMP server
   - The plugin backend only handles REST API requests

### 🔄 Future Enhancement

To read directly from plugin settings:

```go
// Future implementation
func readPluginSettings() {
    // Call Grafana API to get plugin settings
    // GET /api/plugins/otel-collector-agent-fleet-management/settings
    // Parse jsonData
    // Use values instead of environment variables
}
```

## Best Practices

### 1. Configuration Management

**✅ DO**:
- Set plugin UI settings for documentation
- Set matching environment variables in Docker Compose
- Use environment variables for sensitive values (passwords)
- Document both in your deployment configuration

**❌ DON'T**:
- Rely only on plugin UI settings (they're not read automatically)
- Hardcode values in code
- Expose sensitive values in logs

### 2. Embedded vs External Mode

**Choose Embedded When**:
- Simple deployment
- Single Grafana instance
- Development/testing
- Limited resources

**Choose External When**:
- Production deployment
- Need to scale OpAMP server independently
- High availability requirements
- Multiple Grafana instances
- Separate network/security zones

### 3. Configuration Validation

Always verify your configuration:

```bash
# 1. Check plugin settings
curl http://localhost:3000/api/plugins/otel-collector-agent-fleet-management/settings

# 2. Check backend settings
curl http://localhost:3000/api/plugins/otel-collector-agent-fleet-management/resources/settings

# 3. Verify OpAMP server (if embedded)
curl http://localhost:4321/v1/opamp

# 4. Check logs
docker compose logs grafana | grep -i opamp
```

### 4. Troubleshooting Configuration

**Problem**: Backend doesn't respect plugin settings

**Solution**:
1. Check environment variables are set correctly
2. Verify they match plugin UI settings
3. Restart Grafana/backend
4. Check logs for errors

**Problem**: OpAMP server not starting

**Solution**:
1. Verify `OPAMP_ENDPOINT` is set (for embedded mode)
2. Check port 4321 is not in use
3. Verify `OPAMP_SERVER_MODE` is not `"external"`
4. Check firewall rules

**Problem**: Agents can't connect

**Solution**:
1. Verify OpAMP server URL is correct
2. Check network connectivity
3. Verify OpAMP server is running (if external)
4. Check firewall/security groups

## Configuration Examples

### Example 1: Embedded Mode (Development)

```yaml
# docker-compose.yml
grafana:
  environment:
    OPAMP_SERVER_MODE: "embedded"
    OPAMP_ENDPOINT: "0.0.0.0:4321"
```

```json
// Plugin UI Settings
{
  "opampServerMode": "embedded",
  "opampEndpoint": "0.0.0.0:4321"
}
```

### Example 2: External Mode (Production)

```yaml
# docker-compose.standalone.yml
grafana:
  environment:
    OPAMP_SERVER_MODE: "external"
    OPAMP_SERVER_URL: "http://opamp-server:4321"

opamp-server:
  ports:
    - "4321:4321"
```

```json
// Plugin UI Settings
{
  "opampServerMode": "external",
  "opampServerURL": "http://opamp-server:4321"
}
```

### Example 3: With TLS (External)

```yaml
# docker-compose.yml
grafana:
  environment:
    OPAMP_SERVER_MODE: "external"
    OPAMP_SERVER_URL: "https://opamp.example.com:4321"
```

```json
// Plugin UI Settings
{
  "opampServerMode": "external",
  "opampServerURL": "https://opamp.example.com:4321"
}
```

**Note**: For TLS, use a reverse proxy (nginx/traefik) in front of the OpAMP server.

## Summary

- **`backend: true`**: Enables server-side Go backend
- **`opampServerMode`**: Controls whether OpAMP runs embedded or external
- **`opampServerURL`**: External OpAMP server URL (when using external mode)
- **`opampEndpoint`**: Where embedded OpAMP server listens

**Current Implementation**: Reads from environment variables (must match plugin settings)

**Future**: Direct reading from plugin `jsonData` settings

For more details, see:
- [Backend Configuration](./BACKEND_CONFIG.md)
- [Standalone OpAMP Setup](./STANDALONE_OPAMP_SETUP.md)
- [OpAMP Server Setup](./OPAMP_SERVER_SETUP.md)

