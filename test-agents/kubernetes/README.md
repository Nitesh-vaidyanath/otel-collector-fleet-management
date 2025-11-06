# Kubernetes OpAMP Setup

This directory contains scripts and configurations for setting up OpenTelemetry Collectors managed via OpAMP Bridge in Kubernetes.

## Quick Start

### Clean Setup (Recommended)

This removes all existing resources and creates a fresh setup with correct labels and capabilities:

```bash
cd test-agents/kubernetes
./setup-clean.sh
```

### What It Creates

1. **OpAMP Bridge** (`opamp-bridge`)
   - Connects to OpAMP server at `ws://host.docker.internal:4321/v1/opamp`
   - Capabilities: AcceptsRemoteConfig, ReportsEffectiveConfig, ReportsHealth, ReportsRemoteConfigStatus
   - All component types allowed

2. **Three OpenTelemetryCollector CRDs**:
   - `test-simple`: Basic deployment with OTLP receiver
   - `test-collector`: Deployment with OTLP and hostmetrics
   - `otel-collector-daemonset`: Daemonset collector for node-level metrics

All collectors are pre-configured with:
- ✅ Correct `opentelemetry.io/opamp-managed` label matching bridge deployment name
- ✅ Telemetry enabled (Prometheus metrics on port 8888)
- ✅ Proper resource limits

## Using opamp-go Library

This setup leverages the official [opamp-go](https://github.com/open-telemetry/opamp-go) library (v0.22.0) which provides:

- **Server implementation**: Handles WebSocket connections and OpAMP protocol
- **Protocol buffers**: Type-safe message definitions
- **Callbacks**: Connection lifecycle and message handling hooks
- **Type safety**: Full OpAMP specification compliance

The backend uses `opamp-go` for:
- Server setup and connection management
- Message parsing and validation
- Protocol compliance (InstanceUID handling, capabilities, etc.)

## Architecture

```
┌─────────────────┐
│  OpAMP Server   │  (Backend using opamp-go)
│  (Grafana)      │
└────────┬────────┘
         │ WebSocket (ws://host.docker.internal:4321/v1/opamp)
         │
┌────────▼────────────────────────┐
│  OpAMP Bridge                  │
│  (opamp-bridge-opamp-bridge)   │
└────────┬────────────────────────┘
         │ Kubernetes API
         │
    ┌────┴────┬──────────┬──────────┐
    │         │          │          │
┌───▼───┐ ┌───▼───┐ ┌───▼────┐ ┌───▼────┐
│ test- │ │ test- │ │ otel-  │ │ ...   │
│simple │ │collect│ │collect │ │       │
│       │ │  or   │ │or-ds   │ │       │
└───────┘ └───────┘ └────────┘ └───────┘
```

## Labels

### Critical Label: `opentelemetry.io/opamp-managed`

**Value**: Must match the bridge deployment name (typically `opamp-bridge-opamp-bridge`)

This label tells the bridge which collectors it's allowed to manage. Without this label (or with incorrect value), the bridge will reject config pushes.

**Why**: The bridge checks this label before applying RemoteConfig to prevent accidental modifications.

## Verification

### Check Labels
```bash
kubectl get opentelemetrycollectors --all-namespaces \
  -L opentelemetry.io/opamp-managed
```

### Check Bridge Status
```bash
kubectl get opampbridge opamp-bridge -n opentelemetry-operator-system
kubectl get deployment opamp-bridge-opamp-bridge -n opentelemetry-operator-system
```

### Check Bridge Logs
```bash
kubectl logs -n opentelemetry-operator-system \
  -l app.kubernetes.io/name=opamp-bridge -f
```

Look for:
- `DISCOVERED COLLECTOR` messages
- Connection status to OpAMP server
- Config push attempts and results

### Check Collector Discovery

After ~30-60 seconds, check backend logs for:
```
DISCOVERED COLLECTOR: namespace=default, name=test-simple, stable_uid=...
```

## Troubleshooting

### Bridge Not Connecting to Server

1. Check endpoint in OpAMPBridge CRD:
```bash
   kubectl get opampbridge opamp-bridge -n opentelemetry-operator-system -o yaml | grep endpoint
   ```

2. For Docker Desktop K8s: Use `ws://host.docker.internal:4321/v1/opamp`
3. For native K8s: Use service DNS like `ws://opamp-server.default.svc.cluster.local:4321/v1/opamp`

### Collectors Not Discovered

1. Verify labels are correct:
```bash
   kubectl get opentelemetrycollector test-simple -n default -o yaml | grep opamp-managed
   ```

2. Check bridge logs for discovery messages
3. Restart bridge if needed:
```bash
   kubectl rollout restart deployment opamp-bridge-opamp-bridge -n opentelemetry-operator-system
```

### Config Push Fails

#### Error: `cannot modify a collector that doesn't have opentelemetry.io/opamp-managed set`

**Fix**: Ensure the label value matches the bridge deployment name exactly:
```bash
BRIDGE_NAME=$(kubectl get deployment -n opentelemetry-operator-system \
  -o jsonpath='{range .items[?(@.metadata.name=~"opamp-bridge.*")]}{.metadata.name}{"\n"}{end}' | head -1)

kubectl label opentelemetrycollector test-simple -n default \
  opentelemetry.io/opamp-managed=$BRIDGE_NAME --overwrite
```

#### Error: `admission webhook denied the request: the OpenTelemetry Collector mode is set to daemonset, which does not support modification`

**Problem**: This occurs when trying to update a DaemonSet collector via OpAMP Bridge.

**Root Cause**: The OpAMP Bridge sends full-object updates instead of patching only `spec.config`. The operator's webhook rejects DaemonSet updates that touch non-config fields.

**Workaround**: Use `kubectl patch` to update only `spec.config`:
```bash
# Patch only the config field for DaemonSet collectors
kubectl patch opentelemetrycollector otel-collector-daemonset -n default \
  --type='merge' \
  -p='{"spec":{"config":"<your-config-yaml>"}}'
```

**Alternative**: Use `deployment` or `statefulset` mode instead of `daemonset` if you need remote config updates via OpAMP Bridge.

**Related Issue**: [open-telemetry/opentelemetry-operator#4481](https://github.com/open-telemetry/opentelemetry-operator/issues/4481)

See [TROUBLESHOOTING.md](../../docs/TROUBLESHOOTING.md#opamp-bridge-daemonset-mode-configuration-update-failure) for more details.

## Cleanup

To remove everything:
```bash
kubectl delete opentelemetrycollector --all --all-namespaces
kubectl delete opampbridge opamp-bridge -n opentelemetry-operator-system
kubectl delete clusterrolebinding opamp-bridge
kubectl delete clusterrole opamp-bridge
kubectl delete serviceaccount opamp-bridge -n opentelemetry-operator-system
```

## Reference

- [OpAMP Specification](https://opentelemetry.io/docs/specs/opamp/)
- [opamp-go Library](https://github.com/open-telemetry/opamp-go)
- [OpAMP for OpenTelemetry Operator](https://docs.google.com/document/d/1M8VLNe_sv1MIfu5bUR5OV_vrMBnAI7IJN-7-IAr37JY)
