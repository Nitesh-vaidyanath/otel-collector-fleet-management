# OpAMP Server Code Structure

## Overview

All code is consolidated in `pkg/backend/` directory. Both the plugin backend and standalone server share the same codebase using Go build tags.

## Directory Structure

```
opamp-server/
├── pkg/
│   ├── backend/                    # All backend code (shared)
│   │   ├── main.go                # Plugin backend entry (build tag: !standalone)
│   │   ├── main_standalone.go     # Standalone server entry (build tag: standalone)
│   │   ├── handlers.go            # HTTP handlers (shared)
│   │   ├── opamp.go               # OpAMP server logic (shared)
│   │   ├── http.go                # HTTP routing (shared)
│   │   ├── logger.go              # Logging utilities (shared)
│   │   └── rbac.go                # RBAC middleware (shared)
│   └── migrations/                # Database migrations
├── Dockerfile                      # Plugin backend Docker image
├── Dockerfile.standalone           # Standalone server Docker image
└── go.mod                          # Go module definition
```

## Build Tags

### Plugin Backend Build
```bash
go build -o plugin_linux_amd64 ./pkg/backend
```
- Includes: `main.go`, `handlers.go`, `opamp.go`, `http.go`, `logger.go`, `rbac.go`
- Excludes: `main_standalone.go` (has `!standalone` tag)

### Standalone Server Build
```bash
go build -tags standalone -o opamp-server ./pkg/backend
```
- Includes: `main_standalone.go`, `handlers.go`, `opamp.go`, `http.go`, `logger.go`, `rbac.go`
- Excludes: `main.go` (has `!standalone` tag)

## Shared Code

All these files are shared between both builds (no build tags):
- `handlers.go` - HTTP request handlers
- `opamp.go` - OpAMP server implementation
- `http.go` - HTTP routing and middleware
- `logger.go` - Logging utilities
- `rbac.go` - Role-based access control

## Global Variables

Both `main.go` and `main_standalone.go` define the same global variables:
```go
var (
    globalOpampManager *OpampManager
    appLogger          *Logger
)
```

These are shared with handlers.go, opamp.go, etc.

## Benefits

✅ **No Code Duplication**: All shared code in one place  
✅ **Single Source of Truth**: Changes propagate to both builds  
✅ **Easy Maintenance**: Fix bugs once, works for both  
✅ **Clean Structure**: No duplicate files to maintain

## Building

### Plugin Backend
```bash
cd opamp-server
go build -o plugin_linux_amd64 ./pkg/backend
```

### Standalone Server
```bash
cd opamp-server
go build -tags standalone -o opamp-server ./pkg/backend
```

### Docker Images

**Plugin Backend**:
```bash
cd opamp-server
docker build -f Dockerfile -t plugin-backend:latest .
```

**Standalone Server**:
```bash
cd opamp-server
docker build -f Dockerfile.standalone -t opamp-server:latest .
```

