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

1. Create a Spanner instance and database:
   ```bash
   gcloud spanner instances create my-instance \
     --config=regional-us-central1 \
     --description="OTel Collector Fleet Management" \
     --nodes=1
   
   gcloud spanner databases create grafana_agents \
     --instance=my-instance
   ```

2. Set up authentication:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
   ```

3. Run migrations to create tables (see Database Migrations section)

---

## Database Migrations

The plugin includes database migrations located in `pkg/migrations/`. Migrations are automatically applied when the plugin starts.

### Manual Migration

To run migrations manually:

```bash
# Set environment variables
export DB_TYPE=mysql
export DB_HOST=localhost
export DB_PORT=3306
export DB_NAME=grafana_agents
export DB_USER=grafana
export DB_PASSWORD=your_password

# Run migrations
go run cmd/migrate/main.go
```

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
- `0013_org_databases.sql`: Organization-specific databases
- `0014_pushed_at_tracking.sql`: Config push tracking
- `0015_config_status_tracking.sql`: Remote config status tracking
- `0016_cleanup_unused_tables.sql`: Cleanup unused tables

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
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=grafana_agents
DB_USER=grafana
DB_PASSWORD=your_password
OPAMP_ENDPOINT=0.0.0.0:4321

# Cloud SQL specific
CLOUD_SQL_INSTANCE=my-project:us-central1:my-instance

# Spanner specific
SPANNER_DATABASE=projects/my-project/instances/my-instance/databases/grafana_agents
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
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

For secure connections, the backend supports SSL. Configure SSL parameters in the connection string:

```yaml
jsonData:
  dbSSLMode: "require"  # or "verify-ca", "verify-full"
```

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
- [Database Schema](./DATA_MODEL.md)

