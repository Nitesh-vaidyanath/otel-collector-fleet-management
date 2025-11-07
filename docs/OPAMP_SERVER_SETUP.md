# OpAMP Server Setup & Running

## How OpAMP Server Works

The OpAMP server is **embedded** in the Grafana plugin backend. It runs automatically when Grafana loads the plugin.

### Architecture

```
Grafana Container
├── Grafana Server (port 3000)
└── Plugin Backend Process
    ├── HTTP API Server (for Grafana resource API)
    └── OpAMP Server (port 4321) ← This runs automatically!
```

### How It Starts

1. **Grafana loads the plugin:**
   - Reads `plugin.json` (says `"backend": true`)
   - Executes the backend binary: `plugin` (symlink to `plugin_linux_amd64`)

2. **Backend starts (in `main.go`):**
   - Initializes OpAMP manager
   - Starts OpAMP server in a goroutine on port 4321
   - Starts HTTP API server for Grafana

3. **OpAMP server runs:**
   - Listens on `0.0.0.0:4321` (from `OPAMP_ENDPOINT` env var)
   - Accepts agent connections via OpAMP protocol
   - Handles agent registration, config pushes, health reports

## Current Setup

The OpAMP server is **already running** in your docker-compose setup:

```yaml
grafana:
  ports:
    - "4321:4321"  # OPAMP server port ← Already exposed!
  environment:
    OPAMP_ENDPOINT: "0.0.0.0:4321"  # ← Already configured!
```

## Verify It's Running

### Check 1: Backend Process
```bash
docker compose exec grafana ps aux | grep plugin
# Should see: plugin_linux_amd64 and plugin (symlink)
```

### Check 2: OpAMP Server Logs
```bash
docker compose logs grafana | grep -i "opamp.*start"
# Should see: "OPAMP server started successfully"
```

### Check 3: Port Listening
```bash
docker compose exec grafana netstat -tlnp | grep 4321
# Should see port 4321 listening
```

### Check 4: Agent Connections
```bash
docker compose logs grafana | grep -i "opamp.*message\|agent.*connect"
# Should see agent connection messages
```

## Connect Agents to OpAMP Server

Agents connect to:
```
ws://localhost:4321/v1/opamp
# or
http://localhost:4321/v1/opamp
```

### Example Agent Config

```yaml
extensions:
  opamp:
    server:
      ws:
        endpoint: ws://localhost:4321/v1/opamp
      http:
        endpoint: http://localhost:4321/v1/opamp
```

## Running Standalone (Optional)

If you want to run OpAMP server separately (not embedded in Grafana):

### Option 1: Separate Docker Service

Add to `docker-compose.yml`:

```yaml
opamp-server:
  build:
    context: ./opamp-server
    dockerfile: Dockerfile
  container_name: opamp-server
  ports:
    - "4321:4321"
  environment:
    OPAMP_ENDPOINT: "0.0.0.0:4321"
    DB_TYPE: mysql
    DB_HOST: mysql
    DB_PORT: 3306
    DB_NAME: grafana_agents
    DB_USER: grafana
    DB_PASSWORD: grafana123
  depends_on:
    - mysql
```

### Option 2: Run Locally

```bash
cd opamp-server
go run ./pkg/backend
```

## Troubleshooting

### OpAMP Server Not Starting

1. **Check backend binary exists:**
   ```bash
   ls -la dist/plugin_linux_amd64
   ```

2. **Check Grafana logs:**
   ```bash
   docker compose logs grafana | grep -i "opamp\|error"
   ```

3. **Check environment variable:**
   ```bash
   docker compose exec grafana env | grep OPAMP
   ```

4. **Restart Grafana:**
   ```bash
   docker compose restart grafana
   ```

### Port 4321 Already in Use

If port 4321 is already in use:

```bash
# Find what's using it
lsof -i :4321
# or
netstat -an | grep 4321

# Change port in docker-compose.yml:
ports:
  - "4322:4321"  # Use different host port
```

And update agent configs to use the new port.

## Current Status

✅ **OpAMP server IS running** - it's embedded in the Grafana plugin backend
✅ **Port 4321 is exposed** in docker-compose.yml
✅ **Environment variable is set** (`OPAMP_ENDPOINT`)
✅ **Agents can connect** to `localhost:4321`

You don't need a separate service - it's already running!

