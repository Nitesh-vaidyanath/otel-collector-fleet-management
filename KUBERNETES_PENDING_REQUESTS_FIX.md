# Fix: API Requests Stuck in "Pending" State

## Problem
Frontend requests to `/api/plugins/otel-collector-agent-fleet-management/resources/organizations` and `/api/plugins/.../resources/agents` are stuck in "pending" state. This means the backend isn't responding.

## Root Cause
The backend process is either:
1. Not starting at all
2. Crashing immediately on startup
3. Hanging on database connection

## Step-by-Step Diagnosis

### Step 1: Check if Backend Process is Running

```bash
kubectl exec -it deployment/grafana -n platform -- \
  ps aux | grep plugin

# If you see nothing → Backend didn't start
# If you see plugin_linux_amd64 or plugin_linux_arm64 → Backend is running
```

### Step 2: Check Grafana Logs for Backend Errors

```bash
# Look for backend startup errors
kubectl logs -f deployment/grafana -n platform | grep -iE "plugin|backend|error|fatal|database|mysql"

# Key things to look for:
# - "Failed to create OPAMP manager" → Database connection issue
# - "executable not found" → Symlink/binary issue
# - "dial tcp" → Database host unreachable
# - "Access denied" → Wrong database credentials
```

### Step 3: Verify Symlinks Exist

```bash
kubectl exec -it deployment/grafana -n platform -- \
  ls -la /var/lib/grafana/plugins/otel-collector-agent-fleet-management/ | grep _linux

# Must see:
# lrwxrwxrwx ... _linux_amd64 -> plugin_linux_amd64
# lrwxrwxrwx ... _linux_arm64 -> plugin_linux_arm64
```

### Step 4: Test Database Connection

```bash
# Test if Grafana pod can reach MySQL
kubectl exec -it deployment/grafana -n platform -- \
  mysql -h mysql.platform.svc.cluster.local -u grafana -p grafana_agents -e "SELECT 1;"

# If this fails, backend will also fail
```

## Quick Fixes

### Fix 1: Create Missing Symlinks

```bash
kubectl exec -it deployment/grafana -n platform -- sh -c "
  cd /var/lib/grafana/plugins/otel-collector-agent-fleet-management
  ln -sf plugin_linux_amd64 _linux_amd64 2>/dev/null || true
  ln -sf plugin_linux_arm64 _linux_arm64 2>/dev/null || true
  chmod +x plugin_linux_amd64 plugin_linux_arm64
  ls -la | grep -E '_linux|plugin_linux'
"

# Restart Grafana
kubectl rollout restart deployment/grafana -n platform
```

### Fix 2: Check Environment Variables

```bash
kubectl exec -it deployment/grafana -n platform -- env | grep -E "DB_|OPAMP_|GF_"

# Must have:
# DB_HOST=mysql.platform.svc.cluster.local
# DB_NAME=grafana_agents
# DB_USER=grafana
# DB_PASSWORD=... (from secret)
# OPAMP_ENDPOINT=0.0.0.0:4321
```

### Fix 3: Verify Database Exists

```bash
# Connect to MySQL and check database
kubectl exec -it deployment/mysql -n platform -- \
  mysql -u root -p -e "SHOW DATABASES;" | grep grafana_agents

# If missing, create it:
kubectl exec -it deployment/mysql -n platform -- \
  mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS grafana_agents;"
```

## Complete Diagnostic Script

```bash
#!/bin/bash
NAMESPACE="platform"  # Change to your namespace

echo "=== 1. Backend Process Check ==="
kubectl exec -it deployment/grafana -n $NAMESPACE -- \
  ps aux | grep plugin || echo "❌ Backend NOT running"

echo -e "\n=== 2. Symlinks Check ==="
kubectl exec -it deployment/grafana -n $NAMESPACE -- \
  ls -la /var/lib/grafana/plugins/otel-collector-agent-fleet-management/ | grep -E "_linux|plugin_linux"

echo -e "\n=== 3. Database Connection Test ==="
kubectl exec -it deployment/grafana -n $NAMESPACE -- \
  mysql -h mysql.$NAMESPACE.svc.cluster.local -u grafana -pgrafana123 grafana_agents -e "SELECT 1;" 2>&1 | head -3

echo -e "\n=== 4. Environment Variables ==="
kubectl exec -it deployment/grafana -n $NAMESPACE -- env | grep -E "DB_HOST|DB_NAME|DB_USER|OPAMP_ENDPOINT"

echo -e "\n=== 5. Recent Grafana Logs (Errors) ==="
kubectl logs deployment/grafana -n $NAMESPACE --tail=50 | grep -iE "error|fatal|plugin|backend|database" | tail -10
```

## Most Common Issues

### Issue 1: Backend Not Starting (No Process)

**Symptoms:** `ps aux | grep plugin` shows nothing

**Causes:**
- Missing symlinks
- Binary not executable
- Plugin.json has wrong `executable` field

**Fix:**
```bash
# Create symlinks and fix permissions
kubectl exec -it deployment/grafana -n platform -- sh -c "
  cd /var/lib/grafana/plugins/otel-collector-agent-fleet-management
  ln -sf plugin_linux_amd64 _linux_amd64
  ln -sf plugin_linux_arm64 _linux_arm64
  chmod +x plugin_linux_amd64 plugin_linux_arm64
"
kubectl rollout restart deployment/grafana -n platform
```

### Issue 2: Backend Crashing on Startup

**Symptoms:** Process starts then dies, logs show errors

**Causes:**
- Database connection failing
- Missing environment variables

**Fix:**
```bash
# Check logs for specific error
kubectl logs deployment/grafana -n platform --tail=100 | grep -i "error\|fatal"

# Fix database connection or environment variables
```

### Issue 3: Backend Hanging on Database Query

**Symptoms:** Process running but requests timeout

**Causes:**
- Database slow/unresponsive
- Network policy blocking
- Wrong database credentials

**Fix:**
```bash
# Test database directly
kubectl exec -it deployment/grafana -n platform -- \
  mysql -h mysql.platform.svc.cluster.local -u grafana -p grafana_agents

# Check network policies
kubectl get networkpolicies -n platform
```

## Expected Behavior After Fix

1. **Backend process running:**
   ```
   grafana   1234  ... plugin_linux_amd64
   ```

2. **Grafana logs show:**
   ```
   Starting Grafana plugin backend
   OPAMP server started successfully
   ```

3. **API requests complete:**
   - `/api/plugins/.../resources/organizations` → Returns 200 with JSON
   - `/api/plugins/.../resources/agents` → Returns 200 with JSON

4. **No pending requests in browser**

## Quick Test After Fix

```bash
# Port forward Grafana
kubectl port-forward -n platform deployment/grafana 3000:3000

# Test API endpoint
curl http://localhost:3000/api/plugins/otel-collector-agent-fleet-management/resources/agents

# Should return JSON, not timeout or 500
```

