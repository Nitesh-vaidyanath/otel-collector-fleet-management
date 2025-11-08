# Kubernetes Deployment Guide - Using mysql.platform.svc.cluster.local

## Summary of Changes

The database host has been configured to use `mysql.platform.svc.cluster.local` in the following files:

1. **`provisioning/plugins/otel-collector-agent-fleet-management-auto-enable.yaml`** - Updated with Kubernetes service DNS
2. **`test-agents/kubernetes/grafana-deployment-example.yaml`** - Created example Kubernetes deployment

## Configuration Methods

### Method 1: Via Grafana Provisioning File (Recommended)

The provisioning file is already updated:
```yaml
# provisioning/plugins/otel-collector-agent-fleet-management-auto-enable.yaml
jsonData:
  dbHost: mysql.platform.svc.cluster.local
  dbPort: 3306
  dbName: grafana_agents
  dbUser: grafana
```

### Method 2: Via Environment Variables

Set these environment variables in your Kubernetes Deployment:

```yaml
env:
  - name: DB_HOST
    value: "mysql.platform.svc.cluster.local"
  - name: DB_PORT
    value: "3306"
  - name: DB_NAME
    value: "grafana_agents"
  - name: DB_USER
    value: "grafana"
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: mysql-secret
        key: password
```

### Method 3: Complete DSN String

```yaml
env:
  - name: AGENTS_MYSQL_DSN
    value: "grafana:password@tcp(mysql.platform.svc.cluster.local:3306)/grafana_agents?parseTime=true&loc=Local&charset=utf8mb4,utf8"
```

## Build Steps

### 1. Build the Plugin

```bash
# Build both backend and frontend
make build-plugin

# Or build separately:
make build-backend   # Builds Go backend binaries
make build-frontend   # Builds React frontend
```

This creates:
- `dist/plugin_linux_amd64` - Backend binary for AMD64
- (Optional) Build artifacts for other architectures such as ARM64 are no longer packaged by default. If you need them, run `GOARCH=arm64 go build` manually and add the result to the plugin directory.
- `dist/public/` - Frontend assets
- `dist/plugin.json` - Plugin manifest

### Required Grafana Environment Variables

Make sure your Grafana deployment includes the following environment variables so the UI can call the plugin backend safely:

| Variable | Purpose | Suggested value |
|----------|---------|-----------------|
| `GF_SECURITY_ACTIONS_ALLOW_POST_URL` | Allow Grafana frontends to call this plugin’s backend resources | `/api/plugins/otel-collector-agent-fleet-management/*` |
| `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS` | Permit loading this unsigned plugin | `otel-collector-agent-fleet-management` |
| `GF_SERVER_ROOT_URL` | Set when serving Grafana behind a sub-path (example `https://nitesh.test/grafana/`) | *(your Grafana URL)* |
| `GF_SERVER_SERVE_FROM_SUB_PATH` | Required when using a sub-path ingress | `true` |

Adjust cookie/path settings (`GF_SECURITY_COOKIE_PATH`, etc.) if you host Grafana under a path prefix.

> 📘 **Grafana Enterprise Access Control:** assign the `plugins.app:access` permission for this plugin ID to the Viewer/Editor roles. See `docs/ACCESS_CONTROL.md` for provisioning examples.

### 2. Prepare for Kubernetes Deployment

#### Option A: Use ConfigMaps

```bash
# Create ConfigMap with plugin files
kubectl create configmap grafana-plugin \
  --from-file=./dist \
  --namespace=platform \
  --dry-run=client -o yaml > grafana-plugin-configmap.yaml

# Create ConfigMap with provisioning
kubectl create configmap grafana-provisioning \
  --from-file=./provisioning/plugins \
  --namespace=platform \
  --dry-run=client -o yaml > grafana-provisioning-configmap.yaml
```

#### Option B: Build Docker Image

```bash
# Build plugin Docker image
cd plugin
docker build -t your-registry/otel-collector-plugin:latest .

# Push to registry
docker push your-registry/otel-collector-plugin:latest
```

### 3. Create Secrets

```bash
# MySQL password secret
kubectl create secret generic mysql-secret \
  --from-literal=password=your_mysql_password \
  --namespace=platform

# Grafana admin password secret (optional)
kubectl create secret generic grafana-secret \
  --from-literal=admin-password=admin \
  --namespace=platform
```

### 4. Deploy to Kubernetes

Use the example deployment file:
```bash
kubectl apply -f test-agents/kubernetes/grafana-deployment-example.yaml
```

Or create your own deployment using the example as a template.

## Verification

### 1. Check Pod Status

```bash
kubectl get pods -n platform -l app=grafana
```

### 2. Check Logs

```bash
kubectl logs -f deployment/grafana -n platform | grep -i "database\|mysql\|opamp"
```

Look for:
- `✓ Database connection successful`
- `✓ OpAMP server started`
- Any connection errors

### 3. Test Database Connection

```bash
# Test DNS resolution
kubectl run -it --rm debug --image=busybox --restart=Never -- \
  nslookup mysql.platform.svc.cluster.local

# Test MySQL connection from Grafana pod
kubectl exec -it deployment/grafana -n platform -- \
  mysql -h mysql.platform.svc.cluster.local -u grafana -p grafana_agents
```

### 4. Access Grafana UI

```bash
# Port forward to access Grafana
kubectl port-forward -n platform deployment/grafana 3000:3000

# Access at http://localhost:3000
# Login: admin/admin (or your configured password)
```

## Troubleshooting

### Database Connection Issues

1. **Verify MySQL service exists**:
   ```bash
   kubectl get svc mysql -n platform
   ```

2. **Check service endpoints**:
   ```bash
   kubectl get endpoints mysql -n platform
   ```

3. **Verify network policies**:
   ```bash
   kubectl get networkpolicies -n platform
   ```
   Ensure policies allow traffic between Grafana and MySQL pods.

4. **Check DNS resolution**:
   ```bash
   kubectl exec -it deployment/grafana -n platform -- nslookup mysql.platform.svc.cluster.local
   ```

### Build Issues

1. **Clean and rebuild**:
   ```bash
   make clean
   make build-plugin
   ```

2. **Check Go version**:
   ```bash
   go version  # Should be 1.21+
   ```

3. **Check Node.js version**:
   ```bash
   node --version  # Should be LTS version
   ```

### Plugin Not Loading

1. **Check plugin files are mounted**:
   ```bash
   kubectl exec -it deployment/grafana -n platform -- \
     ls -la /var/lib/grafana/plugins/otel-collector-agent-fleet-management
   ```

2. **Check Grafana logs**:
   ```bash
   kubectl logs -f deployment/grafana -n platform | grep -i plugin
   ```

3. **Verify plugin.json**:
   ```bash
   kubectl exec -it deployment/grafana -n platform -- \
     cat /var/lib/grafana/plugins/otel-collector-agent-fleet-management/plugin.json
   ```

## Next Steps

1. **Run database migrations**:
   ```bash
   # From Grafana pod or a migration job
   kubectl exec -it deployment/grafana -n platform -- \
     /var/lib/grafana/plugins/otel-collector-agent-fleet-management/plugin_linux_amd64 migrate
   ```

2. **Configure OpAMP Bridge**:
   Update OpAMP Bridge configuration to point to your Grafana OpAMP service:
   ```yaml
   opamp:
     endpoint: "ws://grafana.platform.svc.cluster.local:4321/v1/opamp"
   ```

3. **Set up TLS** (optional):
   See [MySQL TLS Configuration](../docs/MYSQL_TLS_CONFIG.md) for TLS setup.

## Files Modified

- ✅ `provisioning/plugins/otel-collector-agent-fleet-management-auto-enable.yaml`
- ✅ `test-agents/kubernetes/grafana-deployment-example.yaml` (created)

## Files to Build

After making changes, rebuild:
```bash
make build-plugin
```

This will rebuild both backend and frontend with the latest changes.

