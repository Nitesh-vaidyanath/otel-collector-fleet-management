# Troubleshooting Guide

## Error: "MIME type ('application/json') is not executable"

**Problem:** The `module.js` file is being served with wrong MIME type or not found.

**Solution:**
1. **Build the plugin frontend:**
   ```bash
   make build-frontend
   # or
   cd plugin/src && yarn build
   ```

2. **Verify files are in place:**
   ```bash
   ls -la dist/public/module.js
   ls -la dist/plugin.json
   ```

3. **Restart Grafana:**
   ```bash
   docker compose restart grafana
   ```

4. **Check Grafana logs:**
   ```bash
   docker compose logs grafana | grep -i "plugin\|module\|error"
   ```

**Root Cause:** The frontend wasn't built, so `dist/public/module.js` was missing. Grafana serves plugin files directly from the mounted volume, not through the backend API.

---

## Error: "404 (Not Found)" for `/api/gnet/plugins/...`

**Problem:** Grafana tries to fetch plugin metadata from Grafana.net (gnet).

**Solution:**
- **This is NORMAL and can be ignored** - Grafana always tries to fetch plugin metadata from Grafana.net
- For local/unsigned plugins, this will always return 404
- It doesn't affect plugin functionality

**To suppress this (optional):**
- The plugin is already configured to load unsigned plugins via:
  ```yaml
  GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS: otel-collector-agent-fleet-management
  ```

---

## Plugin Not Loading

**Checklist:**

1. **Plugin is built:**
   ```bash
   make build-plugin
   ```

2. **Files are in dist folder:**
   ```bash
   ls -la dist/
   # Should see: plugin.json, public/module.js, plugin_linux_amd64, plugin_linux_arm64
   ```

3. **Docker volume is mounted correctly:**
   ```bash
   docker compose exec grafana ls -la /var/lib/grafana/plugins/otel-collector-agent-fleet-management
   ```

4. **Plugin is enabled:**
   - Check Grafana UI: Administration → Plugins
   - Or verify provisioning file exists

5. **Restart Grafana:**
   ```bash
   docker compose restart grafana
   ```

---

## MIME Type Error Details

**What happened:**
- Browser requested: `/public/plugins/otel-collector-agent-fleet-management/module.js`
- Grafana serves this directly from the mounted volume
- If file doesn't exist, Grafana might return JSON error (hence wrong MIME type)

**Fix:**
- Ensure `dist/public/module.js` exists
- Ensure volume mount is correct: `./dist:/var/lib/grafana/plugins/otel-collector-agent-fleet-management`
- Restart Grafana after building

---

## Quick Fix Workflow

```bash
# 1. Build everything
make build-plugin

# 2. Verify files
ls -la dist/public/module.js

# 3. Restart services
docker compose restart grafana

# 4. Check logs
docker compose logs grafana --tail 50
```

---

## OpAMP Bridge: DaemonSet Mode Configuration Update Failure

### Problem

When using the OpenTelemetry Operator's OpAMP Bridge to update an `OpenTelemetryCollector` that runs in `spec.mode: daemonset`, the bridge fails with a webhook denial error even if the remote config only intends to change `spec.config`.

**Error Message:**
```
admission webhook "vopentelemetrycollectorcreateupdatebeta.kb.io" denied the request: 
the OpenTelemetry Collector mode is set to daemonset, which does not support modification
```

### Root Cause

The OpAMP Bridge uses `collector.DeepCopy()` and sends a full-object update to the Kubernetes API, which unintentionally "touches" fields that the operator's webhook forbids for DaemonSet pools. The webhook blocks DaemonSet updates that modify:

- `spec.mode`
- `spec.image`
- `spec.targetAllocator`
- `spec.volumes`
- `spec.volumeMounts`
- `spec.env`
- `spec.resources`
- `spec.upgradeStrategy`
- Other non-config spec mutations

Even though the bridge only intends to update `spec.config`, the full-object update includes zero-values or unchanged fields that still register as a spec mutation, causing the webhook to reject the update.

**Related Issue:** [open-telemetry/opentelemetry-operator#4481](https://github.com/open-telemetry/opentelemetry-operator/issues/4481)

### Workaround

**Option 1: Use `kubectl patch` for DaemonSet collectors (Manual)**

For DaemonSet collectors, manually patch only `spec.config`:

```bash
# Patch only the config field
kubectl patch opentelemetrycollector <collector-name> -n <namespace> \
  --type='merge' \
  -p='{"spec":{"config":"<your-config-yaml>"}}'
```

**Option 2: Use Deployment or StatefulSet mode instead**

If you need remote configuration updates via OpAMP Bridge, consider using:
- `spec.mode: deployment` - Supports full remote configuration updates
- `spec.mode: statefulset` - Supports full remote configuration updates

**Option 3: Wait for Operator Fix**

This is a known limitation in the OpenTelemetry Operator's OpAMP Bridge. Monitor the [GitHub issue](https://github.com/open-telemetry/opentelemetry-operator/issues/4481) for updates. The fix would require the bridge to use strategic merge patches for `spec.config` only instead of full-object updates.

### Current Status

- ✅ **Manual `kubectl patch` works** - You can manually update DaemonSet collector configs
- ✅ **Deployment/StatefulSet mode works** - Full OpAMP Bridge support for these modes
- ❌ **OpAMP Bridge + DaemonSet mode** - Currently blocked by operator webhook validation
- 🔄 **Fix in progress** - Tracked in operator issue #4481

### Verification

To verify if your collector is in DaemonSet mode:

```bash
kubectl get opentelemetrycollector <collector-name> -n <namespace> \
  -o jsonpath='{.spec.mode}'
```

If it returns `daemonset`, remote config updates via OpAMP Bridge will fail until the operator issue is resolved.

---

