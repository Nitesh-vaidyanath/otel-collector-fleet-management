# Standalone OpAMP Server Setup

This guide explains how to run the OpAMP server as a separate service, independent of the Grafana plugin.

## Overview

The OpAMP server can run in two modes:

1. **Embedded Mode** (default): OpAMP server runs inside the Grafana plugin backend
2. **External/Standalone Mode**: OpAMP server runs as a separate service

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│   Grafana       │         │  OpAMP Server    │
│   Plugin        │────────▶│  (Standalone)    │
│   (Backend API) │         │  :4321           │
└─────────────────┘         └──────────────────┘
       │                             │
       │                             │
       └────────────┬─────────────────┘
                    │
            ┌───────▼────────┐
            │    MySQL       │
            │    Database    │
            └────────────────┘
```

## Quick Start

### 1. Build the Standalone OpAMP Server

```bash
# Build the standalone OpAMP server Docker image
cd opamp-server
docker build -f Dockerfile.standalone -t opamp-server:latest .
```

### 2. Start All Services

```bash
# Start MySQL, OpAMP server, and Grafana
docker compose -f tests/docker/docker-compose.standalone.yml up -d
```

### 3. Configure Grafana Plugin

1. Go to Grafana: `http://localhost:3000`
2. Navigate to **Configuration** → **Plugins** → **OTel Collector Agent Fleet Management**
3. Configure plugin settings:
   - **OpAMP Server Mode**: Select "External (standalone)"
   - **External OpAMP Server URL**: `http://opamp-server:4321` (or your external URL)
   - Configure database connection (same database as OpAMP server)

### 4. Verify Setup

```bash
# Check OpAMP server health
curl http://localhost:8080/health

# Check OpAMP endpoint
curl http://localhost:4321/v1/opamp
```

## Docker Compose Configuration

The `tests/docker/docker-compose.standalone.yml` file includes:

- **mysql**: MySQL database (shared between plugin and OpAMP server)
- **opamp-server**: Standalone OpAMP server
- **grafana**: Grafana with plugin (configured to use external OpAMP server)

## Environment Variables

### OpAMP Server

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTS_MYSQL_DSN` | Complete database DSN | Required |
| `DB_TYPE` | Database type (mysql, cloudsql-mysql, etc.) | - |
| `DB_HOST` | Database host | - |
| `DB_PORT` | Database port | - |
| `DB_NAME` | Database name | - |
| `DB_USER` | Database user | - |
| `DB_PASSWORD` | Database password | - |

### Grafana Plugin

| Variable | Description | Default |
|----------|-------------|---------|
| `OPAMP_SERVER_MODE` | `embedded` or `external` | `embedded` |
| `OPAMP_SERVER_URL` | External OpAMP server URL | - |
| `AGENTS_MYSQL_DSN` | Database connection (for plugin features) | - |
| `GF_SECURITY_ACTIONS_ALLOW_POST_URL` | Allow frontend calls to the plugin backend resources | `/api/plugins/otel-collector-agent-fleet-management/*` |

## Command Line Options

The standalone OpAMP server supports the following flags:

```bash
./opamp-server \
  -endpoint=0.0.0.0:4321 \
  -db-dsn="user:password@tcp(host:3306)/database" \
  -tls \
  -cert=/path/to/cert.pem \
  -key=/path/to/key.pem
```

### Flags

- `-endpoint`: OpAMP server endpoint (default: `0.0.0.0:4321`)
- `-tls`: Enable TLS/HTTPS (optional)
- `-cert`: Path to TLS certificate file (required if `-tls`)
- `-key`: Path to TLS private key file (required if `-tls`)
- `-db-dsn`: Complete database DSN (overrides individual db-* flags)
- `-db-type`: Database type
- `-db-host`: Database host
- `-db-port`: Database port
- `-db-name`: Database name
- `-db-user`: Database user
- `-db-password`: Database password
- `-cloudsql-instance`: Cloud SQL instance connection name

## TLS/HTTPS Support

### Enable TLS in Docker Compose

1. Generate TLS certificates:

```bash
# Create directory for certificates
mkdir -p opamp-server/tls

# Generate self-signed certificate (for testing)
openssl req -x509 -newkey rsa:4096 -keyout opamp-server/tls/key.pem \
  -out opamp-server/tls/cert.pem -days 365 -nodes \
  -subj "/CN=opamp-server"
```

2. Update `tests/docker/docker-compose.standalone.yml`:

```yaml
opamp-server:
  command:
    - "-endpoint=0.0.0.0:4321"
    - "-tls"
    - "-cert=/app/tls/cert.pem"
    - "-key=/app/tls/key.pem"
```

3. Update agent configuration to use `wss://` instead of `ws://`:

```yaml
opamp:
  server:
    endpoint: wss://your-opamp-server:4321/v1/opamp
```

### Production TLS Setup

For production, use certificates from:
- Let's Encrypt (certbot)
- Internal CA
- Cloud provider managed certificates

## Switching Between Modes

### From Embedded to Standalone

1. Stop Grafana: `docker compose stop grafana`
2. Start standalone services: `docker compose -f tests/docker/docker-compose.standalone.yml up -d`
3. Update Grafana plugin configuration to use external mode
4. Restart Grafana: `docker compose start grafana`

### From Standalone to Embedded

1. Stop standalone OpAMP server: `docker compose -f tests/docker/docker-compose.standalone.yml stop opamp-server`
2. Update Grafana plugin configuration to use embedded mode
3. Set `OPAMP_SERVER_MODE=embedded` (or remove the env var)
4. Restart Grafana: `docker compose restart grafana`

## Monitoring

### Health Check

The OpAMP server exposes a health endpoint:

```bash
curl http://localhost:8080/health
```

Response:
```json
{
  "status": "ok",
  "service": "opamp-server",
  "endpoint": "0.0.0.0:4321",
  "tls": false
}
```

### Logs

```bash
# View OpAMP server logs
docker compose -f tests/docker/docker-compose.standalone.yml logs -f opamp-server

# View Grafana logs
docker compose -f tests/docker/docker-compose.standalone.yml logs -f grafana
```

## Troubleshooting

### OpAMP Server Not Starting

1. Check database connection:
   ```bash
   docker compose -f tests/docker/docker-compose.standalone.yml exec opamp-server ./opamp-server -db-dsn="..." -endpoint=0.0.0.0:4321
   ```

2. Verify database is accessible:
   ```bash
   docker compose -f tests/docker/docker-compose.standalone.yml exec mysql mysql -u grafana -pgrafana123 grafana_agents -e "SELECT 1;"
   ```

### Agents Cannot Connect

1. Verify OpAMP server is running:
   ```bash
   curl http://localhost:4321/v1/opamp
   ```

2. Check firewall/network rules
3. Verify agent configuration points to correct endpoint

### Plugin Cannot Connect to External OpAMP

1. Verify `OPAMP_SERVER_URL` is set correctly
2. Check network connectivity between Grafana and OpAMP server
3. Verify OpAMP server is accessible from Grafana container

## Advantages of Standalone Mode

1. **Independent Scaling**: Scale OpAMP server independently from Grafana
2. **Resource Isolation**: OpAMP server has dedicated resources
3. **High Availability**: Can run multiple OpAMP server instances
4. **Security**: OpAMP server can be in a separate network/zone
5. **TLS Termination**: Easier to configure TLS at the service level

## Production Deployment

For production, consider:

1. **Load Balancing**: Use a load balancer in front of multiple OpAMP server instances
2. **Database**: Use managed database (Cloud SQL, RDS, etc.)
3. **TLS**: Use proper certificates from a trusted CA
4. **Monitoring**: Add Prometheus metrics endpoint
5. **Logging**: Centralized logging (ELK, Loki, etc.)
6. **Backup**: Regular database backups

