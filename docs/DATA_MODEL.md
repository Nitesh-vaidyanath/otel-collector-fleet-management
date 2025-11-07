# Data Model and Architecture

This document describes the data model, database schema, and system architecture for the OTel Collector Agent Fleet Management system.

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    Grafana Plugin Frontend                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Agent      │  │   Config     │  │  Monitoring  │         │
│  │ Management   │  │  Generator   │  │   Dashboard  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└────────────────────────────┬───────────────────────────────────┘
                              │
                              │ HTTP/REST API
                              │ (TLS/HTTPS optional)
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                    Plugin Backend (Go)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   REST API   │  │  OpAMP       │  │   Database   │         │
│  │   Handlers   │  │  Server      │  │   Access     │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐                           │
│  │   RBAC       │  │   TLS Config │                           │
│  │  Middleware  │  │  Management  │                           │
│  └──────────────┘  └──────────────┘                           │
└──────────────┬──────────────────────────────┬──────────────────┘
               │                                │
               │ OpAMP Protocol                 │ Database Connection
               │ (WebSocket/gRPC)               │ (TLS/SSL)
               │ WSS/TLS (optional)             │ Certificate Auth
               │                                │
┌──────────────▼───────────────────────────────▼──────────────────┐
│  OpenTelemetry Collector Agents          MySQL Database          │
│  ┌──────────────┐                        ┌──────────────┐      │
│  │  Standalone   │                        │   Agents     │      │
│  │   Agents      │                        │   Bridges    │      │
│  └──────────────┘                        │   Configs    │      │
│  ┌──────────────┐                        │   Telemetry  │      │
│  │ OpAMP Bridge  │                        │   Activity   │      │
│  │  (K8s)        │                        └──────────────┘      │
│  └──────────────┘                                                │
└───────────────────────────────────────────────────────────────────┘
```

### Security Architecture

#### TLS/SSL Layers

1. **Frontend ↔ Backend**
   - HTTPS/TLS via Grafana or reverse proxy
   - API authentication via RBAC middleware

2. **Backend ↔ Database**
   - **TLS/SSL Support**: Full TLS/SSL support for MySQL connections
   - **TLS Modes**: `preferred`, `required`, `skip-verify`, `verify-ca`, `verify-full`, `custom`
   - **Certificate Authentication**: Client certificate authentication support
   - **CA Verification**: Server certificate verification against CA
   - **Configuration**: Via environment variables (`DB_TLS_MODE`, `DB_TLS_CA_FILE`, `DB_TLS_CERT_FILE`, `DB_TLS_KEY_FILE`)

3. **Backend ↔ Agents**
   - WSS/TLS for OpAMP WebSocket connections (optional)
   - Certificate-based authentication support

#### Authentication & Authorization

- **RBAC**: Role-based access control for API endpoints
- **Database Credentials**: Encrypted storage in `secureJsonData`
- **Environment Variables**: Sensitive configuration via environment variables
- **Certificate Management**: Secure certificate storage and validation

## Database Schema

### Core Tables

#### `organizations`
Multi-tenant organization support.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Primary key |
| `name` | VARCHAR(255) | Organization name |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

#### `agents`
Stores agent information and status.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Primary key |
| `org_id` | BIGINT | Foreign key to `organizations` |
| `agent_uid` | VARCHAR(255) | Unique agent identifier (SHA256 hash) |
| `name` | VARCHAR(255) | Agent name |
| `version` | VARCHAR(50) | Agent version |
| `status` | ENUM | `online`, `offline`, `degraded` |
| `last_seen_at` | TIMESTAMP | Last heartbeat timestamp |
| `labels_json` | JSON | Agent labels/metadata |
| `capabilities_json` | JSON | OpAMP capabilities |
| `k8s_namespace` | VARCHAR(255) | Kubernetes namespace (for bridge-managed collectors) |
| `k8s_crd_name` | VARCHAR(255) | Kubernetes CRD name (for bridge-managed collectors) |
| `cluster_id` | VARCHAR(255) | Cluster identifier |
| `current_config_yaml` | TEXT | Current configuration YAML |
| `current_config_hash` | VARCHAR(64) | SHA256 hash of current config |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

**Indexes**:
- `PRIMARY KEY (id)`
- `UNIQUE KEY (org_id, agent_uid)`
- `INDEX idx_agents_ns_name (k8s_namespace, k8s_crd_name)`
- `INDEX idx_agents_cluster_ns_name (cluster_id, k8s_namespace, k8s_crd_name)`
- `INDEX idx_agents_status (status, last_seen_at)`

#### `bridges`
Stores OpAMP Bridge instances (separate from agents).

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Primary key |
| `org_id` | BIGINT | Foreign key to `organizations` |
| `bridge_uid` | VARCHAR(255) | Unique bridge identifier |
| `name` | VARCHAR(255) | Bridge name |
| `version` | VARCHAR(50) | Bridge version |
| `status` | ENUM | `online`, `offline`, `degraded` |
| `last_seen_at` | TIMESTAMP | Last heartbeat timestamp |
| `labels_json` | JSON | Bridge labels/metadata |
| `capabilities_json` | JSON | OpAMP capabilities |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

**Indexes**:
- `PRIMARY KEY (id)`
- `UNIQUE KEY (org_id, bridge_uid)`
- `INDEX idx_bridges_status (status, last_seen_at)`

#### `agent_configs`
Configuration versions and history.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Primary key |
| `org_id` | BIGINT | Foreign key to `organizations` |
| `agent_uid` | VARCHAR(255) | Foreign key to `agents.agent_uid` |
| `name` | VARCHAR(255) | Configuration name |
| `version` | INT | Configuration version number |
| `config_yaml` | TEXT | Configuration YAML |
| `config_hash` | VARCHAR(64) | SHA256 hash of config |
| `status` | ENUM | `pending`, `approved`, `rejected`, `pushed` |
| `approved_by` | BIGINT | User ID who approved |
| `approved_at` | TIMESTAMP | Approval timestamp |
| `pushed_at` | TIMESTAMP | Push timestamp |
| `created_at` | TIMESTAMP | Creation timestamp |

**Indexes**:
- `PRIMARY KEY (id)`
- `INDEX idx_agent_configs_agent_version (agent_uid, version)`
- `INDEX idx_agent_configs_status (status)`

#### `agent_telemetry`
Telemetry data from agents (metrics, logs, traces).

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Primary key |
| `org_id` | BIGINT | Foreign key to `organizations` |
| `agent_uid` | VARCHAR(255) | Foreign key to `agents.agent_uid` |
| `telemetry_type` | ENUM | `metrics`, `logs`, `traces`, `health`, `pipeline_status` |
| `telemetry_data` | JSON | Telemetry payload |
| `reported_at` | TIMESTAMP | When telemetry was reported |
| `created_at` | TIMESTAMP | Record creation timestamp |

**Indexes**:
- `PRIMARY KEY (id)`
- `INDEX idx_telemetry_agent_type_time (agent_uid, telemetry_type, reported_at)`

#### `agent_activity`
Activity logs for agents.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Primary key |
| `org_id` | BIGINT | Foreign key to `organizations` |
| `agent_uid` | VARCHAR(255) | Foreign key to `agents.agent_uid` |
| `activity_type` | VARCHAR(50) | Activity type |
| `description` | TEXT | Activity description |
| `metadata` | JSON | Additional metadata |
| `created_at` | TIMESTAMP | Activity timestamp |

**Indexes**:
- `PRIMARY KEY (id)`
- `INDEX idx_activity_agent_time (agent_uid, created_at)`

### Data Relationships

```
organizations (1) ──< (many) agents
organizations (1) ──< (many) bridges
agents (1) ──< (many) agent_configs
agents (1) ──< (many) agent_telemetry
agents (1) ──< (many) agent_activity
```

### Agent UID Generation

**Standalone Agents**:
- Uses OpAMP `InstanceUid` from agent connection
- Normalized (hyphens removed) for consistency

**Bridge-Managed Collectors**:
- Stable UID: `SHA256(namespace + "/" + crd_name)`
- Ensures unique identification across namespaces
- Persisted in `k8s_namespace` and `k8s_crd_name` columns

## Connection Architecture

### Database Connection Flow

```
Backend Startup
    │
    ├─> Read Environment Variables
    │   ├─> DB_TLS_MODE
    │   ├─> DB_TLS_CA_FILE
    │   ├─> DB_TLS_CERT_FILE
    │   └─> DB_TLS_KEY_FILE
    │
    ├─> Register Custom TLS Config (if certs provided)
    │   └─> mysql.RegisterTLSConfig("custom", tlsConfig)
    │
    ├─> Build DSN String
    │   └─> Add TLS parameter: &tls=<mode>
    │
    └─> Open Database Connection
        └─> MySQL Driver uses TLS config
```

### TLS Configuration Modes

1. **No TLS** (default): No TLS parameter in DSN
2. **Preferred**: `tls=preferred` - Use TLS if available
3. **Required**: `tls=required` - Require TLS connection
4. **Skip Verify**: `tls=skip-verify` - TLS without certificate verification
5. **Verify CA**: `tls=verify-ca` - Verify server certificate against CA
6. **Verify Full**: `tls=verify-full` - Verify certificate and hostname
7. **Custom**: `tls=custom` - Use registered custom TLS config with client certificates

## Data Flow

### Agent Registration Flow

```
Agent Connects via OpAMP
    │
    ├─> Detect Bridge (reports_effective_config capability)
    │   └─> Register in `bridges` table
    │
    ├─> Detect Standalone Agent
    │   └─> Register in `agents` table
    │
    └─> Bridge Reports EffectiveConfig
        └─> UPSERT collectors in `agents` table
            └─> Key: SHA256(namespace/name)
```

### Configuration Push Flow

```
User Creates Config
    │
    ├─> Save to `agent_configs` (status: pending)
    │
    ├─> Admin Approval
    │   └─> Update status: approved
    │
    ├─> Push via OpAMP
    │   ├─> Standalone Agent: Direct OpAMP message
    │   └─> Bridge-Managed: Route via bridge connection
    │
    └─> Update `agents.current_config_yaml` and `current_config_hash`
```

### Health Status Flow

```
Agent Heartbeat
    │
    ├─> Update `agents.last_seen_at`
    │
    ├─> Check ComponentHealthMap
    │   └─> Update `agents.status` (online/degraded)
    │
    └─> Bridge Reports Collector Health
        └─> Update collector `agents.status` via UPSERT
```

## Security Considerations

### Database Security

1. **TLS/SSL Encryption**: All database connections support TLS/SSL
2. **Certificate Verification**: CA certificate verification for server authentication
3. **Client Certificates**: Optional client certificate authentication
4. **Credential Storage**: Database passwords encrypted in `secureJsonData`
5. **Connection Pooling**: Secure connection pool management

### Data Security

1. **Multi-tenancy**: Organization-based data isolation
2. **RBAC**: Role-based access control for API endpoints
3. **Audit Logging**: Activity logs for all agent operations
4. **Configuration Versioning**: Full history of configuration changes
5. **Data Retention**: Configurable cleanup of stale agents and telemetry

## Performance Considerations

### Database Optimization

1. **Indexes**: Strategic indexes on frequently queried columns
2. **Connection Pooling**: Configurable connection pool (default: 25 max, 5 idle)
3. **Query Optimization**: Parameterized queries to prevent SQL injection
4. **Cleanup Jobs**: Automatic cleanup of stale offline agents (>24 hours)

### Scalability

1. **Horizontal Scaling**: Backend can scale horizontally
2. **Database Sharding**: Support for organization-specific databases
3. **Connection Management**: Efficient connection reuse
4. **Caching**: Consider caching for frequently accessed data

## Migration Strategy

Database migrations are located in `opamp-server/pkg/migrations/` and are automatically applied on startup. Key migrations:

- `0017_add_k8s_columns.sql`: Adds Kubernetes-specific columns to `agents` table
- `0018_create_bridges_table.sql`: Creates `bridges` table and migrates bridge data

See [Backend Configuration](./BACKEND_CONFIG.md) for migration details.

