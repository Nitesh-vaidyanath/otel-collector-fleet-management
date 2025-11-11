# OpAMP Server API Specification

This document describes the REST API endpoints provided by the OTel Collector Agent Fleet Management plugin backend.

## Base URL

All API endpoints are prefixed with:
```
/api/plugins/otel-collector-agent-fleet-management/resources
```

## Authentication

All endpoints require Grafana authentication. The plugin uses Grafana's built-in authentication and RBAC (Role-Based Access Control) system.

- **Viewer** role: Can read all data
- **Editor** role: Can read and update configurations
- **Admin** role: Can perform all operations including creating organizations and deleting agents

## Endpoints

### Health Check

**GET** `/health`

Check if the backend service is running.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-01T12:00:00Z"
}
```

---

### Logging Configuration

#### Get Logging Settings

**GET** `/logging`

Returns the current log level and whether JSON logging is enabled.

```json
{
  "level": "info",
  "jsonLogging": false
}
```

#### Update Logging Settings

**POST** `/logging` *(Admin only)*

```json
{
  "level": "debug",
  "jsonLogging": true
}
```

**Response**

```json
{
  "ok": true,
  "level": "debug",
  "jsonLogging": true
}
```

---

### Organizations

#### List Organizations

**GET** `/organizations`

Get all organizations.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Production",
    "created_at": "2025-01-01T12:00:00Z",
    "updated_at": "2025-01-01T12:00:00Z"
  }
]
```

#### Create Organization

**POST** `/organizations`

Create a new organization. **Requires Admin role.**

**Request Body:**
```json
{
  "name": "Development"
}
```

**Response:**
```json
{
  "id": 2,
  "name": "Development",
  "created_at": "2025-01-01T12:00:00Z",
  "updated_at": "2025-01-01T12:00:00Z"
}
```

---

### Agents

#### List Agents

**GET** `/agents?org_id={org_id}`

Get all agents, optionally filtered by organization.

**Query Parameters:**
- `org_id` (optional): Filter by organization ID

**Response:**
```json
[
  {
    "id": 1,
    "agentUid": "agent-123",
    "agentName": "collector-1",
    "status": "online",
    "organizationId": 1,
    "lastSeenAt": "2025-01-01T12:00:00Z",
    "createdAt": "2025-01-01T10:00:00Z",
    "updatedAt": "2025-01-01T12:00:00Z"
  }
]
```

#### Get Agent

**GET** `/agents/{agent_uid}`

Get a specific agent by UID.

**Response:**
```json
{
  "id": 1,
  "agentUid": "agent-123",
  "agentName": "collector-1",
  "status": "online",
  "organizationId": 1,
  "lastSeenAt": "2025-01-01T12:00:00Z",
  "createdAt": "2025-01-01T10:00:00Z",
  "updatedAt": "2025-01-01T12:00:00Z",
  "agent": {
    "status": "online",
    "version": "0.100.0",
    "capabilities": {
      "reportsOwnMetrics": true,
      "reportsOwnTraces": true,
      "reportsOwnLogs": true
    }
  }
}
```

#### Update Agent

**PATCH** `/agents/{agent_uid}`

Update agent metadata.

**Request Body:**
```json
{
  "agentName": "collector-1-updated"
}
```

**Response:**
```json
{
  "id": 1,
  "agentUid": "agent-123",
  "agentName": "collector-1-updated",
  "status": "online",
  "organizationId": 1,
  "lastSeenAt": "2025-01-01T12:00:00Z",
  "createdAt": "2025-01-01T10:00:00Z",
  "updatedAt": "2025-01-01T12:05:00Z"
}
```

#### Delete Agent

**DELETE** `/agents/{agent_uid}`

Delete an agent. **Requires Admin role.**

**Response:**
```json
{
  "message": "Agent deleted successfully"
}
```

---

### Agent Operations

#### Execute Agent Operation

**POST** `/agents/{agent_uid}/operations`

Execute an operation on an agent (e.g., push config, restart).

**Request Body:**
```json
{
  "operation": "push_config",
  "configId": 123
}
```

**Available Operations:**
- `push_config`: Push a configuration to the agent
- `restart`: Restart the agent (requires OpAMP support)

**Response:**
```json
{
  "success": true,
  "message": "Configuration pushed successfully",
  "operationId": "op-123"
}
```

---

### Agent Configuration

#### Get Agent Current Config

**GET** `/agents/{agent_uid}/current-config`

Get the current active configuration for an agent.

**Response:**
```json
{
  "config": {
    "receivers": {...},
    "processors": {...},
    "exporters": {...},
    "service": {...}
  },
  "hash": "abc123",
  "status": "synced",
  "remoteConfigStatus": "APPLIED",
  "remoteConfigError": null,
  "remoteConfigStatusAt": "2025-01-01T12:00:00Z",
  "effectiveConfigHash": "abc123",
  "hashMatch": true
}
```

#### Get Agent Config Sync Status

**GET** `/agents/{agent_uid}/config-sync-status`

Get the synchronization status of the agent's configuration.

**Response:**
```json
{
  "status": "synced",
  "hashMatch": true,
  "remoteConfigStatus": "APPLIED",
  "remoteConfigError": null,
  "lastSyncAt": "2025-01-01T12:00:00Z"
}
```

#### Compare Agent Configs

**GET** `/agents/{agent_uid}/config-compare?config_id={config_id}`

Compare the agent's current config with a stored config version.

**Query Parameters:**
- `config_id`: ID of the config version to compare

**Response:**
```json
{
  "current": {
    "hash": "abc123",
    "config": {...}
  },
  "proposed": {
    "id": 123,
    "hash": "def456",
    "config": {...}
  },
  "diff": {
    "added": [...],
    "removed": [...],
    "modified": [...]
  }
}
```

#### Get Agent Config Diff

**GET** `/agents/{agent_uid}/config-diff?config_id={config_id}`

Get a detailed diff between two configuration versions.

**Query Parameters:**
- `config_id`: ID of the config version to diff against

**Response:**
```json
{
  "diff": "--- current\n+++ proposed\n@@ -1,3 +1,4 @@\n ...",
  "summary": {
    "linesAdded": 5,
    "linesRemoved": 2,
    "filesChanged": 1
  }
}
```

---

### Agent Telemetry

#### Get Agent Telemetry

**GET** `/agents/{agent_uid}/telemetry`

Get telemetry data (metrics, logs, traces) for an agent.

**Query Parameters:**
- `limit` (optional): Maximum number of records to return (default: 100)
- `offset` (optional): Offset for pagination (default: 0)

**Response:**
```json
{
  "metrics": [
    {
      "id": 1,
      "agentUid": "agent-123",
      "metricName": "cpu_usage",
      "metricValue": 45.5,
      "timestamp": "2025-01-01T12:00:00Z"
    }
  ],
  "logs": [
    {
      "id": 1,
      "agentUid": "agent-123",
      "logLevel": "info",
      "logMessage": "Configuration applied successfully",
      "timestamp": "2025-01-01T12:00:00Z"
    }
  ],
  "traces": [],
  "total": 100,
  "limit": 100,
  "offset": 0
}
```

---

### Agent Health

#### Get Agent Health

**GET** `/agents/{agent_uid}/health`

Get the health status of an agent.

**Response:**
```json
{
  "healthy": true,
  "status": "online",
  "lastSeenAt": "2025-01-01T12:00:00Z",
  "uptime": "2h 30m",
  "version": "0.100.0"
}
```

---

### Agent Pipelines

#### Get Agent Pipelines

**GET** `/agents/{agent_uid}/pipelines`

Get pipeline information for an agent (receivers, processors, exporters).

**Response:**
```json
{
  "traces": {
    "receivers": ["otlp"],
    "processors": ["batch", "memory_limiter"],
    "exporters": ["otlp"]
  },
  "metrics": {
    "receivers": ["prometheus"],
    "processors": ["batch"],
    "exporters": ["prometheus"]
  },
  "logs": {
    "receivers": ["filelog"],
    "processors": ["batch"],
    "exporters": ["loki"]
  }
}
```

---

### Configurations

#### List Configurations

**GET** `/configs?agent_uid={agent_uid}`

Get all configurations, optionally filtered by agent UID.

**Query Parameters:**
- `agent_uid` (optional): Filter by agent UID

**Response:**
```json
[
  {
    "id": 1,
    "agentUid": "agent-123",
    "config": {...},
    "hash": "abc123",
    "status": "approved",
    "version": 1,
    "createdAt": "2025-01-01T10:00:00Z",
    "updatedAt": "2025-01-01T10:00:00Z",
    "approvedAt": "2025-01-01T10:05:00Z",
    "approvedBy": "admin",
    "pushedAt": "2025-01-01T10:10:00Z"
  }
]
```

#### Get Configuration

**GET** `/configs/{config_id}`

Get a specific configuration by ID.

**Response:**
```json
{
  "id": 1,
  "agentUid": "agent-123",
  "config": {
    "receivers": {...},
    "processors": {...},
    "exporters": {...},
    "service": {...}
  },
  "hash": "abc123",
  "status": "approved",
  "version": 1,
  "createdAt": "2025-01-01T10:00:00Z",
  "updatedAt": "2025-01-01T10:00:00Z",
  "approvedAt": "2025-01-01T10:05:00Z",
  "approvedBy": "admin",
  "pushedAt": "2025-01-01T10:10:00Z"
}
```

#### Create Configuration

**POST** `/configs`

Create a new configuration for an agent.

**Request Body:**
```json
{
  "agentUid": "agent-123",
  "config": {
    "receivers": {
      "otlp": {
        "protocols": {
          "grpc": {}
        }
      }
    },
    "processors": {
      "batch": {}
    },
    "exporters": {
      "logging": {}
    },
    "service": {
      "pipelines": {
        "traces": {
          "receivers": ["otlp"],
          "processors": ["batch"],
          "exporters": ["logging"]
        }
      }
    }
  }
}
```

**Response:**
```json
{
  "id": 2,
  "agentUid": "agent-123",
  "config": {...},
  "hash": "def456",
  "status": "pending",
  "version": 2,
  "createdAt": "2025-01-01T12:00:00Z",
  "updatedAt": "2025-01-01T12:00:00Z"
}
```

#### Update Configuration

**PATCH** `/configs/{config_id}`

Update an existing configuration.

**Request Body:**
```json
{
  "config": {...},
  "comment": "Updated configuration"
}
```

**Response:**
```json
{
  "id": 1,
  "agentUid": "agent-123",
  "config": {...},
  "hash": "ghi789",
  "status": "pending",
  "version": 2,
  "createdAt": "2025-01-01T10:00:00Z",
  "updatedAt": "2025-01-01T12:05:00Z"
}
```

#### Approve Configuration

**POST** `/configs/{config_id}/approve`

Approve a pending configuration. **Requires Editor or Admin role.**

**Request Body:**
```json
{
  "comment": "Configuration looks good"
}
```

**Response:**
```json
{
  "id": 1,
  "agentUid": "agent-123",
  "config": {...},
  "hash": "abc123",
  "status": "approved",
  "version": 1,
  "approvedAt": "2025-01-01T12:10:00Z",
  "approvedBy": "editor",
  "approvalComment": "Configuration looks good"
}
```

#### Reject Configuration

**POST** `/configs/{config_id}/reject`

Reject a pending configuration. **Requires Editor or Admin role.**

**Request Body:**
```json
{
  "comment": "Configuration has errors"
}
```

**Response:**
```json
{
  "id": 1,
  "agentUid": "agent-123",
  "config": {...},
  "hash": "abc123",
  "status": "rejected",
  "version": 1,
  "rejectedAt": "2025-01-01T12:10:00Z",
  "rejectedBy": "editor",
  "rejectionComment": "Configuration has errors"
}
```

#### Revert Configuration

**POST** `/configs/{config_id}/revert`

Revert to a previous configuration version.

**Response:**
```json
{
  "id": 3,
  "agentUid": "agent-123",
  "config": {...},
  "hash": "jkl012",
  "status": "approved",
  "version": 3,
  "createdAt": "2025-01-01T12:15:00Z",
  "revertedFrom": 2
}
```

#### Delete Configuration

**DELETE** `/configs/{config_id}`

Delete a configuration. **Requires Admin role.**

**Response:**
```json
{
  "message": "Configuration deleted successfully"
}
```

---

### Agent Activity Log

#### Get Agent Activity Log

**GET** `/agents/{agent_uid}/activity`

Get the activity log for an agent.

**Query Parameters:**
- `limit` (optional): Maximum number of records to return (default: 50)
- `offset` (optional): Offset for pagination (default: 0)

**Response:**
```json
[
  {
    "id": 1,
    "agentUid": "agent-123",
    "action": "config_pushed",
    "details": "Configuration v2 pushed successfully",
    "timestamp": "2025-01-01T12:00:00Z",
    "user": "admin"
  }
]
```

---

### Component Types

#### Get Component Types

**GET** `/component-types?category={category}`

Get available component types (receivers, processors, exporters).

**Query Parameters:**
- `category`: One of `receiver`, `processor`, or `exporter`

**Response:**
```json
[
  {
    "name": "otlp",
    "description": "OpenTelemetry Protocol receiver",
    "category": "receiver",
    "supportedSignals": ["traces", "metrics", "logs"]
  }
]
```

---

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {...}
}
```

**Common HTTP Status Codes:**
- `200`: Success
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

---

## OpAMP Protocol

The backend also implements the OpAMP (OpenTelemetry Agent Management Protocol) server. Agents connect to the OpAMP server endpoint (configured via `opampEndpoint` in plugin settings) to:

- Report their health and status
- Receive configuration updates
- Report telemetry data

The OpAMP protocol uses gRPC and is defined in the [OpAMP specification](https://github.com/open-telemetry/opamp-spec).

---

## Rate Limiting

Currently, there are no rate limits enforced. However, clients should implement reasonable retry logic and exponential backoff.

---

## Versioning

This API does not currently use versioning. Future breaking changes will be versioned using URL paths (e.g., `/api/v2/...`).

---

## See Also

- [OpAMP Specification](https://github.com/open-telemetry/opamp-spec)
- [OpenTelemetry Collector Documentation](https://opentelemetry.io/docs/collector/)
- [Grafana Plugin Development](https://grafana.com/developers/plugin-tools/)
