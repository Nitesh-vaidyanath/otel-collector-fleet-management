# API Communication Guide

This document explains how API calls are handled from the Grafana plugin frontend to the backend service.

## Overview

The plugin frontend (React/TypeScript) communicates with the backend service (Go/OpAMP) through Grafana's plugin API infrastructure. All API calls are routed through Grafana's plugin resource handler system.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Grafana Plugin Frontend (React/TypeScript)            │
│  - src/pages/App.tsx                                    │
│  - Uses @grafana/runtime getBackendSrv()               │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ HTTP Request
                   │ /api/plugins/otel-collector-agent-fleet-management/resources/*
                   │
┌──────────────────▼──────────────────────────────────────┐
│  Grafana Plugin SDK                                      │
│  - Resource Handler (plugin backend)                     │
│  - Routes requests to plugin backend executable          │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ gRPC/HTTP (internal)
                   │
┌──────────────────▼──────────────────────────────────────┐
│  Plugin Backend Executable (Go)                         │
│  - opamp-server/pkg/backend/http.go (HTTP router)       │
│  - opamp-server/pkg/backend/handlers.go (request handlers)│
│  - opamp-server/pkg/backend/opamp.go (OpAMP server)     │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ Database Queries
                   │
┌──────────────────▼──────────────────────────────────────┐
│  Database (MySQL / compatible MySQL service)              │
└──────────────────────────────────────────────────────────┘
```

## Frontend API Calls

### Using Grafana's Backend Service

The frontend uses Grafana's `getBackendSrv()` to make API calls:

```typescript
import { getBackendSrv } from '@grafana/runtime';

// GET request
const agents = await getBackendSrv().get(
  '/api/plugins/otel-collector-agent-fleet-management/resources/agents'
);

// POST request
const response = await getBackendSrv().post(
  '/api/plugins/otel-collector-agent-fleet-management/resources/configs',
  {
    agentUid: 'agent-123',
    config: { ... }
  }
);

// PATCH request
await getBackendSrv().patch(
  '/api/plugins/otel-collector-agent-fleet-management/resources/agents/agent-123',
  {
    agentName: 'updated-name'
  }
);

// DELETE request
await getBackendSrv().delete(
  '/api/plugins/otel-collector-agent-fleet-management/resources/configs/123'
);
```

### Example from App.tsx

```typescript
// Fetch agents
const fetchAgents = async () => {
  try {
    const url = selectedOrgId
      ? `/api/plugins/otel-collector-agent-fleet-management/resources/agents?org_id=${selectedOrgId}`
      : '/api/plugins/otel-collector-agent-fleet-management/resources/agents';
    
    const response = await backendSrv.get(url);
    setAgents(response);
  } catch (error) {
    console.error('Failed to fetch agents:', error);
  }
};

// Push configuration to agent
const pushConfig = async (agentUID: string, configId: number) => {
  try {
    const response = await backendSrv.post(
      `/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/operations`,
      {
        operation: 'push_config',
        configId: configId
      }
    );
    return response;
  } catch (error) {
    console.error('Failed to push config:', error);
    throw error;
  }
};
```

## Backend Request Routing

### HTTP Router Setup

The backend sets up HTTP routes in `opamp-server/pkg/backend/http.go`:

```go
func newHTTPMux() *http.ServeMux {
    mux := http.NewServeMux()
    
    // Health check
    mux.HandleFunc("/health", wrap(healthHandler))
    
    // Organizations
    mux.HandleFunc("/organizations", func(w http.ResponseWriter, r *http.Request) {
        switch r.Method {
        case http.MethodGet:
            wrap(organizationsHandler)(w, r)
        case http.MethodPost:
            rbac(RoleAdmin, organizationsHandler)(w, r)
        default:
            http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        }
    })
    
    // Agents
    mux.HandleFunc("/agents", func(w http.ResponseWriter, r *http.Request) {
        switch r.Method {
        case http.MethodGet:
            wrap(agentsCollectionHandler)(w, r)
        case http.MethodPost:
            wrap(agentsCollectionHandler)(w, r)
        default:
            http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        }
    })
    
    // Agent-specific endpoints
    mux.HandleFunc("/agents/", func(w http.ResponseWriter, r *http.Request) {
        path := strings.TrimPrefix(r.URL.Path, "/agents/")
        
        // Special endpoints
        if strings.HasSuffix(path, "/operations") {
            if r.Method == http.MethodPost {
                wrap(agentOperationsHandler)(w, r)
            }
            return
        }
        
        if strings.HasSuffix(path, "/current-config") {
            if r.Method == http.MethodGet {
                wrap(agentCurrentConfigHandler)(w, r)
            }
            return
        }
        
        // Regular agent entity operations
        switch r.Method {
        case http.MethodGet:
            wrap(agentEntityHandler)(w, r)
        case http.MethodPatch:
            wrap(agentEntityHandler)(w, r)
        case http.MethodDelete:
            rbac(RoleAdmin, agentEntityHandler)(w, r)
        default:
            http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        }
    })
    
    // Configurations
    mux.HandleFunc("/configs", func(w http.ResponseWriter, r *http.Request) {
        switch r.Method {
        case http.MethodGet:
            wrap(configsCollectionHandler)(w, r)
        case http.MethodPost:
            wrap(configsCollectionHandler)(w, r)
        default:
            http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        }
    })
    
    // ... more routes
    
    return mux
}
```

### Request Handlers

Handlers are implemented in `opamp-server/pkg/backend/handlers.go`:

```go
func agentsCollectionHandler(w http.ResponseWriter, r *http.Request) {
    switch r.Method {
    case http.MethodGet:
        // Get all agents
        orgID := r.URL.Query().Get("org_id")
        agents, err := globalOpampManager.GetAgents(orgID)
        if err != nil {
            http.Error(w, err.Error(), http.StatusInternalServerError)
            return
        }
        json.NewEncoder(w).Encode(agents)
        
    case http.MethodPost:
        // Create new agent (if needed)
        var agent Agent
        if err := json.NewDecoder(r.Body).Decode(&agent); err != nil {
            http.Error(w, err.Error(), http.StatusBadRequest)
            return
        }
        // ... create agent logic
    }
}
```

## Middleware

### RBAC (Role-Based Access Control)

The backend implements RBAC middleware to control access:

```go
func rbac(requiredRole Role, handler http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Get user role from Grafana context
        userRole := getUserRole(r)
        
        if !hasPermission(userRole, requiredRole) {
            http.Error(w, "forbidden", http.StatusForbidden)
            return
        }
        
        handler(w, r)
    }
}

// Usage
mux.HandleFunc("/organizations", func(w http.ResponseWriter, r *http.Request) {
    switch r.Method {
    case http.MethodGet:
        wrap(organizationsHandler)(w, r) // Viewer+
    case http.MethodPost:
        rbac(RoleAdmin, organizationsHandler)(w, r) // Admin only
    }
})
```

### Error Wrapping

The `wrap` function provides consistent error handling:

```go
func wrap(handler http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if err := recover(); err != nil {
                appLogger.Error("Handler panic", err)
                http.Error(w, "internal server error", http.StatusInternalServerError)
            }
        }()
        
        handler(w, r)
    }
}
```

## API Endpoint Structure

All API endpoints follow this pattern:

```
/api/plugins/otel-collector-agent-fleet-management/resources/{endpoint}
```

### Endpoints

- `/health` - Health check
- `/organizations` - Organization management
- `/agents` - Agent collection operations
- `/agents/{uid}` - Agent entity operations
- `/agents/{uid}/operations` - Agent operations (push config, restart)
- `/agents/{uid}/current-config` - Get current agent config
- `/agents/{uid}/config-sync-status` - Get config sync status
- `/agents/{uid}/config-compare` - Compare configs
- `/agents/{uid}/config-diff` - Get config diff
- `/agents/{uid}/telemetry` - Get agent telemetry
- `/agents/{uid}/health` - Get agent health
- `/agents/{uid}/pipelines` - Get agent pipelines
- `/agents/{uid}/activity` - Get agent activity log
- `/configs` - Configuration collection operations
- `/configs/{id}` - Configuration entity operations
- `/configs/{id}/approve` - Approve configuration
- `/configs/{id}/reject` - Reject configuration
- `/configs/{id}/revert` - Revert to configuration
- `/component-types` - Get component types

See [API Specification](./API_SPEC.md) for complete details.

## Authentication & Authorization

### Grafana Authentication

All API calls are authenticated through Grafana:

1. User logs into Grafana
2. Grafana session cookie is included in requests
3. Backend receives user context from Grafana
4. RBAC middleware checks user role

### Role-Based Access

- **Viewer**: Can read all data
- **Editor**: Can read and update configurations
- **Admin**: Can perform all operations including creating organizations and deleting agents

## Error Handling

### Frontend Error Handling

```typescript
try {
  const response = await backendSrv.get('/api/plugins/otel-collector-agent-fleet-management/resources/agents');
  setAgents(response);
} catch (error) {
  if (error.status === 404) {
    console.error('Resource not found');
  } else if (error.status === 403) {
    console.error('Access denied');
  } else {
    console.error('Error:', error);
  }
}
```

### Backend Error Responses

```go
// Success
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(data)

// Error
http.Error(w, "error message", http.StatusBadRequest)

// Or JSON error
w.Header().Set("Content-Type", "application/json")
w.WriteHeader(http.StatusInternalServerError)
json.NewEncoder(w).Encode(map[string]string{
    "error": "error message",
    "code": "ERROR_CODE",
})
```

## Database Access

The backend accesses the database through the OpAMP manager:

```go
// In handlers.go
func agentsCollectionHandler(w http.ResponseWriter, r *http.Request) {
    // Get agents from database
    agents, err := globalOpampManager.GetAgents(orgID)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    json.NewEncoder(w).Encode(agents)
}
```

The `OpampManager` handles all database operations:

```go
// In opamp.go
func (m *OpampManager) GetAgents(orgID string) ([]Agent, error) {
    query := "SELECT * FROM agents WHERE organization_id = ?"
    rows, err := m.db.Query(query, orgID)
    // ... process rows
}
```

## OpAMP Protocol

The backend also implements the OpAMP server protocol for agent communication:

```go
// Agents connect via gRPC to OpAMP endpoint
func (m *OpampManager) Start(endpoint string) error {
    // Start OpAMP server
    listener, err := net.Listen("tcp", endpoint)
    // ... setup gRPC server
    // Register OpAMP service
    opamp.RegisterServer(grpcServer, m)
    return grpcServer.Serve(listener)
}
```

Agents connect directly to the OpAMP server (not through Grafana's API):

```
Agent (gRPC) → OpAMP Server (pkg/backend/opamp.go) → Database
```

## Testing API Calls

### Frontend Testing

```typescript
// Mock backend service in tests
jest.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({
    get: jest.fn().mockResolvedValue([{ id: 1, agentUid: 'agent-123' }]),
    post: jest.fn().mockResolvedValue({ success: true }),
  }),
}));
```

### Backend Testing

```go
// Test handler
func TestAgentsCollectionHandler(t *testing.T) {
    req := httptest.NewRequest("GET", "/agents", nil)
    w := httptest.NewRecorder()
    
    agentsCollectionHandler(w, req)
    
    assert.Equal(t, http.StatusOK, w.Code)
    // ... verify response
}
```

## See Also

- [API Specification](./API_SPEC.md) - Complete API documentation
- [Backend Configuration](./BACKEND_CONFIG.md) - Backend setup guide
- [Plugin README](./plugin/README.md) - Plugin development guide

