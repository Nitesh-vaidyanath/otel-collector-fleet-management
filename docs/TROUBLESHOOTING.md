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

