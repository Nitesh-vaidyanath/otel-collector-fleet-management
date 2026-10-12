# Backend Configuration Guide

This guide explains how to configure the backend database and OpAMP server for the OTel Collector Agent Fleet Management plugin.

## Plugin Configuration

The plugin can be configured through Grafana's plugin settings UI or via provisioning files.

### Configuration Options

#### Database Configuration

The plugin supports multiple database backends:

1. **MySQL** (Standard MySQL/MariaDB)
2. **Google Cloud SQL (MySQL)**
3. **AWS RDS (MySQL)**
4. **Google Cloud Spanner**

#### JSON Data (Non-sensitive)

These settings are stored in `plugin.json` and can be configured via the Grafana UI:

- **dbType**: Type of database (`mysql`, `cloudsql-mysql`, `aws-rds-mysql`, `spanner`)
- **dbHost**: Database server hostname or IP address
- **dbPort**: Database server port (default: 3306 for MySQL, 5432 for PostgreSQL)
- **dbName**: Name of the database
- **dbUser**: Database username
- **opampEndpoint**: Address and port for the OpAMP server (default: `0.0.0.0:4321`)

#### Secure JSON Data (Sensitive)

These settings are encrypted and stored securely:

- **dbPassword**: Database password
- **cloudSQLInstance**: For Cloud SQL: `project:region:instance`
- **spannerDatabase**: For Spanner: `projects/PROJECT/instances/INSTANCE/databases/DATABASE`

---

## Configuration Examples

### MySQL (Local/Docker)

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

### Google Cloud SQL (MySQL)

**Option 1: Direct Connection via Public IP (Recommended)**

```yaml
apiVersion: 1

plugins:
  - name: otel-collector-agent-fleet-management
    type: app
    enabled: true
    jsonData:
      dbType: mysql  # Use standard MySQL type for direct connection
      dbHost: <PUBLIC_IP_ADDRESS>  # Cloud SQL instance public IP
      dbPort: 3306
      dbName: grafana_agents
      dbUser: grafana
      opampEndpoint: 0.0.0.0:4321
    secureJsonData:
      dbPassword: your_password_here
```

**Setup Steps:**

1. **Enable Public IP on Cloud SQL Instance:**
   ```bash
   gcloud sql instances patch <INSTANCE_NAME> --assign-ip
   ```

2. **Get Public IP Address:**
   ```bash
   gcloud sql instances describe <INSTANCE_NAME> --format="get(ipAddresses[0].ipAddress)"
   ```

3. **Authorize Network Access:**
   - Go to Cloud SQL Console → Your Instance → Connections
   - Add your server's IP address to authorized networks
   - Or use: `gcloud sql instances patch <INSTANCE_NAME> --authorized-networks=<YOUR_IP>/32`

4. **Configure SSL (Recommended):**
   ```yaml
   jsonData:
     dbSSLMode: "require"  # or "verify-ca" for production
   ```

**Option 2: Private IP (VPC Connection)**

If your Grafana server is in the same VPC:

```yaml
jsonData:
  dbType: mysql
  dbHost: <PRIVATE_IP_ADDRESS>  # Cloud SQL private IP
  dbPort: 3306
```

**Option 3: Cloud SQL Proxy (If you prefer proxy)**

Only use this if direct connection doesn't work:

```yaml
jsonData:
  dbType: cloudsql-mysql
  dbHost: 127.0.0.1
  secureJsonData:
    cloudSQLInstance: my-project:us-central1:my-instance
```

Then run Cloud SQL Proxy separately.

### AWS RDS (MySQL)

```yaml
apiVersion: 1

plugins:
  - name: otel-collector-agent-fleet-management
    type: app
    enabled: true
    jsonData:
      dbType: aws-rds-mysql
      dbHost: my-rds-instance.xxxxx.us-east-1.rds.amazonaws.com
      dbPort: 3306
      dbName: grafana_agents
      dbUser: admin
      opampEndpoint: 0.0.0.0:4321
    secureJsonData:
      dbPassword: your_password_here
```

**Setup Steps:**

1. Create an RDS MySQL instance in AWS
2. Configure security groups to allow access from Grafana server
3. Use the RDS endpoint as `dbHost`
4. Ensure SSL is enabled for secure connections

### Google Cloud Spanner

```yaml
apiVersion: 1

plugins:
  - name: otel-collector-agent-fleet-management
    type: app
    enabled: true
    jsonData:
      dbType: spanner
      dbHost: spanner.googleapis.com
      dbPort: 443
      dbName: grafana_agents
      dbUser: ""
      opampEndpoint: 0.0.0.0:4321
    secureJsonData:
      spannerDatabase: projects/my-project/instances/my-instance/databases/grafana_agents
```

**Setup Steps:**

The current backend uses a single MySQL database/schema for all organizations.
Organization isolation is enforced by `org_id` in application queries and the
Grafana-org mapping; there is no per-organization database provisioning or
Spanner driver in this repository.

---

## Database Migrations

The backend does not automatically apply migrations at startup. Apply the
numbered MySQL migrations deliberately before upgrading the backend. For a new
local manual-test database, `tests/manual/generate-init.cjs` creates one
synthetic fixture init script from the migration history.

### Migration status

There is no checked-in migration runner or migration ledger. Do not run the
numbered files repeatedly against a populated database: several are one-time
DDL, and migration `0018` moves legacy bridge rows. For an existing database,
take a backup and review/apply the required version steps once using the
deployment's approved database process. The generated SQL is only for a new,
disposable manual-test volume; it is not an upgrade bundle.

### Migration Files

- `0001_init.sql`: Initial schema (agents, organizations, configs)
- `0002_config_templates.sql`: Configuration templates
- `0003_add_capabilities.sql`: Agent capabilities tracking
- `0004_config_approval.sql`: Configuration approval workflow
- `0005_activity_and_current_config.sql`: Activity logs and current config tracking
- `0006_organizations.sql`: Organizations support
- `0007_component_types.sql`: Component type definitions
- `0008_agent_telemetry.sql`: Telemetry data storage
- `0009_fix_checksum.sql`: Checksum fixes
- `0010_approval_comments.sql`: Approval comments
- `0011_pending_config_queue.sql`: Pending config queue
- `0012_track_config_version.sql`: Config version tracking
- `0013_org_databases.sql`: Indexes supporting organization scoping in the shared schema
- `0014_pushed_at_tracking.sql`: Config push tracking
- `0015_config_status_tracking.sql`: Remote config status tracking
- `0016_cleanup_unused_tables.sql`: Historical cleanup migration
- `0017_add_k8s_columns.sql` through `0020_managed_agent_enrollments.sql`: Kubernetes identity, Grafana-org mapping, and managed-agent enrollment

---

## OpAMP Server Configuration

The OpAMP server listens on the address and port specified in `opampEndpoint`.

### Default Configuration

```
opampEndpoint: 0.0.0.0:4321
```

This makes the server listen on all interfaces on port 4321.

### Network Considerations

- **Development**: Use `localhost:4321` or `127.0.0.1:4321` for local testing
- **Production**: Use `0.0.0.0:4321` to listen on all interfaces, or specify a specific interface IP
- **Docker/Kubernetes**: Ensure the port is exposed and accessible to agents

### Firewall Rules

Ensure the OpAMP port (4321 by default) is open in your firewall:

```bash
# UFW (Ubuntu)
sudo ufw allow 4321/tcp

# Firewalld (RHEL/CentOS)
sudo firewall-cmd --add-port=4321/tcp --permanent
sudo firewall-cmd --reload
```

### Kubernetes Deployment

If deploying in Kubernetes, create a Service:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: opamp-server
spec:
  type: LoadBalancer  # or NodePort for internal access
  ports:
    - port: 4321
      targetPort: 4321
      protocol: TCP
  selector:
    app: grafana
```

---

## Environment Variables

The backend can also be configured via environment variables (useful for Docker/Kubernetes):

```bash
# Database connection
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=grafana_agents
DB_USER=grafana
DB_PASSWORD=your_password

# TLS/SSL Configuration (optional)
DB_TLS_MODE=preferred                    # preferred, required, skip-verify, verify-ca, verify-full, custom
DB_TLS_CA_FILE=/path/to/ca-cert.pem     # CA certificate file
DB_TLS_CERT_FILE=/path/to/client-cert.pem # Client certificate file
DB_TLS_KEY_FILE=/path/to/client-key.pem  # Client private key file

# OpAMP Server
OPAMP_ENDPOINT=0.0.0.0:4321

# Cloud SQL specific
CLOUD_SQL_INSTANCE=my-project:us-central1:my-instance

# Spanner specific
SPANNER_DATABASE=projects/my-project/instances/my-instance/databases/grafana_agents
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

### Complete DSN Format

You can also use a complete DSN string instead of individual variables:

```bash
AGENTS_MYSQL_DSN="user:password@tcp(host:3306)/database?parseTime=true&loc=Local&charset=utf8mb4,utf8&tls=required"
```

---

## Connection Pool Settings

The backend uses a connection pool for database connections. Default settings:

- **Max Open Connections**: 25
- **Max Idle Connections**: 5
- **Connection Max Lifetime**: 5 minutes

These can be adjusted in the backend code if needed.

---

## SSL/TLS Configuration

### MySQL/Cloud SQL

The backend supports comprehensive TLS/SSL configuration for secure MySQL connections. TLS can be configured via environment variables or directly in the DSN.

#### Environment Variables

| Variable | Description | Values | Default |
|----------|-------------|--------|---------|
| `DB_TLS_MODE` | TLS connection mode | `preferred`, `required`, `skip-verify`, `verify-ca`, `verify-full`, `custom` | None (no TLS) |
| `DB_TLS_CA_FILE` | Path to CA certificate file | File path | None |
| `DB_TLS_CERT_FILE` | Path to client certificate file | File path | None |
| `DB_TLS_KEY_FILE` | Path to client private key file | File path | None |

#### TLS Modes

- **`preferred`**: Use TLS if available, but don't require it (default for most connections)
- **`required`**: Require TLS connection (fails if server doesn't support TLS)
- **`skip-verify`**: Use TLS but skip certificate verification (useful for self-signed certs, development only)
- **`verify-ca`**: Verify server certificate against CA (requires `DB_TLS_CA_FILE`)
- **`verify-full`**: Verify server certificate and hostname (requires `DB_TLS_CA_FILE`)
- **`custom`**: Use custom TLS configuration with client certificates (requires `DB_TLS_CERT_FILE` and `DB_TLS_KEY_FILE`)

#### Configuration Examples

**Basic TLS (Preferred Mode)**:
```bash
export DB_TLS_MODE=preferred
export DB_HOST=mysql.example.com
export DB_USER=grafana
export DB_PASSWORD=secure_password
export DB_NAME=grafana_agents
```

**Required TLS with CA Verification**:
```bash
export DB_TLS_MODE=verify-ca
export DB_TLS_CA_FILE=/path/to/ca-cert.pem
export DB_HOST=mysql.example.com
export DB_USER=grafana
export DB_PASSWORD=secure_password
export DB_NAME=grafana_agents
```

**Client Certificate Authentication**:
```bash
export DB_TLS_MODE=custom
export DB_TLS_CA_FILE=/path/to/ca-cert.pem
export DB_TLS_CERT_FILE=/path/to/client-cert.pem
export DB_TLS_KEY_FILE=/path/to/client-key.pem
export DB_HOST=mysql.example.com
export DB_USER=grafana
export DB_PASSWORD=secure_password
export DB_NAME=grafana_agents
```

**Using DSN with TLS**:
```bash
export AGENTS_MYSQL_DSN="user:password@tcp(host:3306)/database?parseTime=true&tls=required"
```

#### Docker Compose Example

```yaml
services:
  opamp-server:
    environment:
      DB_HOST: mysql.example.com
      DB_USER: grafana
      DB_PASSWORD: secure_password
      DB_NAME: grafana_agents
      DB_TLS_MODE: verify-ca
      DB_TLS_CA_FILE: /app/tls/ca-cert.pem
      DB_TLS_CERT_FILE: /app/tls/client-cert.pem
      DB_TLS_KEY_FILE: /app/tls/client-key.pem
    volumes:
      - ./tls:/app/tls:ro
```

#### Security Best Practices

1. **Always use TLS in production**: Set `DB_TLS_MODE=required` or `verify-full`
2. **Use CA certificates**: Always provide `DB_TLS_CA_FILE` for certificate verification
3. **Client certificates**: Use client certificate authentication for additional security
4. **Protect private keys**: Ensure `DB_TLS_KEY_FILE` has restricted permissions (600)
5. **Never use `skip-verify` in production**: Only use for development/testing

For detailed TLS configuration guide, see [MySQL TLS Configuration](./MYSQL_TLS_CONFIG.md).

### Spanner

Spanner uses gRPC with TLS by default. Ensure `GOOGLE_APPLICATION_CREDENTIALS` is set.

---

## Troubleshooting

### Connection Issues

1. **Check database is accessible:**
   ```bash
   mysql -h localhost -u grafana -p grafana_agents
   ```

2. **Check OpAMP server is listening:**
   ```bash
   netstat -tlnp | grep 4321
   # or
   ss -tlnp | grep 4321
   ```

3. **Check plugin logs:**
   - Grafana logs: `/var/log/grafana/grafana.log`
   - Plugin logs: Check Grafana UI → Administration → Plugins → OTel Collector Agent Fleet Management

### Migration Issues

If migrations fail:

1. Check database permissions
2. Verify database exists
3. Check migration files are present
4. Review error messages in logs

### Performance Issues

1. **Database Connection Pool:**
   - Increase max connections if needed
   - Monitor connection usage

2. **OpAMP Server:**
   - Monitor agent connections
   - Check for network latency

---

## Security Best Practices

1. **Use Secure Passwords:** Generate strong passwords for database users
2. **Enable SSL:** Use SSL/TLS for database connections in production
3. **Restrict Network Access:** Limit database access to Grafana server IP only
4. **Use Secrets Management:** Store sensitive credentials in Grafana's secure storage or external secrets manager
5. **Regular Updates:** Keep database and plugin updated with security patches
6. **Monitor Access:** Enable audit logging for database access

---

## See Also

- [API Specification](./API_SPEC.md)
- [Plugin README](./plugin/README.md)
- [Data Model and Architecture](./DATA_MODEL.md)
- [MySQL TLS Configuration](./MYSQL_TLS_CONFIG.md)

