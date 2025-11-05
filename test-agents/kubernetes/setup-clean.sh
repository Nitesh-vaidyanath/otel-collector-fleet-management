#!/bin/bash
# Clean Kubernetes Setup for OpAMP Bridge and Collectors
# This script removes existing setup and recreates everything with correct labels and capabilities
#
# Uses opamp-go library (v0.22.0) via the official OpenTelemetry Operator

set -e

echo "=========================================="
echo "Clean Kubernetes OpAMP Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl not found. Please install kubectl.${NC}"
    exit 1
fi

# Check if we can connect to cluster
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}Error: Cannot connect to Kubernetes cluster.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Kubernetes cluster connection verified${NC}"
echo ""

# Step 1: Clean up existing resources
echo "Step 1: Cleaning up existing resources..."
echo "----------------------------------------"

# Delete collectors first (they may depend on bridge)
echo "  Deleting OpenTelemetryCollector CRDs..."
kubectl delete opentelemetrycollector --all --all-namespaces --ignore-not-found=true || true
sleep 2

# Delete OpAMP Bridge
echo "  Deleting OpAMPBridge CRD..."
kubectl delete opampbridge opamp-bridge -n opentelemetry-operator-system --ignore-not-found=true || true
sleep 2

# Delete bridge service account and RBAC
echo "  Deleting bridge ServiceAccount and RBAC..."
kubectl delete clusterrolebinding opamp-bridge --ignore-not-found=true || true
kubectl delete clusterrole opamp-bridge --ignore-not-found=true || true
kubectl delete serviceaccount opamp-bridge -n opentelemetry-operator-system --ignore-not-found=true || true

# Wait for resources to be fully deleted
echo "  Waiting for resources to be fully deleted..."
sleep 5

echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""

# Step 2: Get bridge name (from OpAMPBridge CRD)
echo "Step 2: Preparing bridge configuration..."
echo "----------------------------------------"

# IMPORTANT: The label value can be either "true" or the OpAMPBridge CRD name
# Per OpAMP Bridge source code (operator/client.go):
# if !labelSetContainsLabel(resourceLabels, ManagedLabelKey, "true") &&
#     !labelSetContainsLabel(resourceLabels, ManagedLabelKey, c.name) {
# This means EITHER value works. Using "true" for simplicity.
BRIDGE_NAME="true"
echo "  OpAMPBridge label value: $BRIDGE_NAME"
echo "  This will be used for opentelemetry.io/opamp-managed label"
echo "  (Bridge accepts either 'true' or the bridge CRD name)"
echo ""

# Step 3: Create OpAMP Bridge with correct capabilities
echo "Step 3: Creating OpAMP Bridge..."
echo "----------------------------------------"

cat <<EOF | kubectl apply -f -
apiVersion: opentelemetry.io/v1alpha1
kind: OpAMPBridge
metadata:
  name: opamp-bridge
  namespace: opentelemetry-operator-system
spec:
  # OpAMP Server endpoint - must be accessible from K8s cluster
  endpoint: ws://host.docker.internal:4321/v1/opamp
  
  # Service account for the bridge
  serviceAccount: opamp-bridge
  
  # Capabilities the bridge supports (per OpAMP spec)
  capabilities:
    AcceptsRemoteConfig: true       # Can receive config from server
    ReportsEffectiveConfig: true    # Reports current collector configs
    ReportsHealth: true             # Reports bridge health
    ReportsRemoteConfig: true       # Reports remote config status
    ReportsRemoteConfigStatus: true # Reports detailed config push status
  
  # All components allowed (not specified = all allowed)
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: opamp-bridge
  namespace: opentelemetry-operator-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: opamp-bridge
rules:
- apiGroups:
  - opentelemetry.io
  resources:
  - opentelemetrycollectors
  verbs:
  - get
  - list
  - watch
  - patch
  - update
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: opamp-bridge
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: opamp-bridge
subjects:
- kind: ServiceAccount
  name: opamp-bridge
  namespace: opentelemetry-operator-system
EOF

echo "  Waiting for bridge to be created..."
sleep 5

# Verify bridge is running
if kubectl get opampbridge opamp-bridge -n opentelemetry-operator-system &> /dev/null; then
    echo -e "${GREEN}✓ OpAMP Bridge CRD created${NC}"
else
    echo -e "${RED}✗ Failed to create OpAMP Bridge${NC}"
    exit 1
fi

echo ""

# Step 4: Create collectors with correct labels
echo "Step 4: Creating OpenTelemetryCollector CRDs with correct labels..."
echo "----------------------------------------"
echo "  NOTE: Collectors MUST be in same namespace as bridge (opentelemetry-operator-system)"
echo ""

# Collector 1: Simple test collector
cat <<EOF | kubectl apply -f -
apiVersion: opentelemetry.io/v1beta1
kind: OpenTelemetryCollector
metadata:
  name: test-simple
  namespace: opentelemetry-operator-system
  labels:
    app: otel-collector
    deployment.type: deployment
    # CRITICAL: This label allows the bridge to manage this collector
    # Value must be the OpAMPBridge CRD name (opamp-bridge), not the deployment name
    opentelemetry.io/opamp-managed: ${BRIDGE_NAME}
spec:
  managementState: managed
  mode: deployment
  replicas: 1
  image: otel/opentelemetry-collector-contrib:latest
  config:
    receivers:
      otlp:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
    processors:
      batch: {}
    exporters:
      debug:
        verbosity: normal
    service:
      pipelines:
        traces:
          receivers: [otlp]
          processors: [batch]
          exporters: [debug]
      telemetry:
        metrics:
          readers:
            - pull:
                exporter:
                  prometheus:
                    host: 0.0.0.0
                    port: 8888
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 100m
      memory: 128Mi
EOF

# Collector 2: Test collector with more features
cat <<EOF | kubectl apply -f -
apiVersion: opentelemetry.io/v1beta1
kind: OpenTelemetryCollector
metadata:
  name: test-collector
  namespace: opentelemetry-operator-system
  labels:
    app: otel-collector
    deployment.type: deployment
    # CRITICAL: This label allows the bridge to manage this collector
    # Value must be the OpAMPBridge CRD name (opamp-bridge), not the deployment name
    opentelemetry.io/opamp-managed: ${BRIDGE_NAME}
spec:
  managementState: managed
  mode: deployment
  replicas: 1
  image: otel/opentelemetry-collector-contrib:latest
  config:
    receivers:
      otlp:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
          http:
            endpoint: 0.0.0.0:4318
      hostmetrics:
        collection_interval: 10s
        scrapers:
          cpu: {}
          memory: {}
          disk: {}
    processors:
      batch:
        timeout: 1s
        send_batch_size: 1024
      resource:
        attributes:
          - key: deployment.type
            value: deployment
            action: upsert
    exporters:
      debug:
        verbosity: normal
    service:
      pipelines:
        traces:
          receivers: [otlp]
          processors: [batch, resource]
          exporters: [debug]
        metrics:
          receivers: [otlp, hostmetrics]
          processors: [batch, resource]
          exporters: [debug]
      telemetry:
        metrics:
          readers:
            - pull:
                exporter:
                  prometheus:
                    host: 0.0.0.0
                    port: 8888
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 100m
      memory: 128Mi
EOF

# Collector 3: Daemonset collector
cat <<EOF | kubectl apply -f -
apiVersion: opentelemetry.io/v1beta1
kind: OpenTelemetryCollector
metadata:
  name: otel-collector-daemonset
  namespace: opentelemetry-operator-system
  labels:
    app: otel-collector
    deployment.type: daemonset
    # CRITICAL: This label allows the bridge to manage this collector
    # Value must be the OpAMPBridge CRD name (opamp-bridge), not the deployment name
    opentelemetry.io/opamp-managed: ${BRIDGE_NAME}
spec:
  managementState: managed
  mode: daemonset
  image: otel/opentelemetry-collector-contrib:latest
  config:
    receivers:
      otlp:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
          http:
            endpoint: 0.0.0.0:4318
      hostmetrics:
        collection_interval: 10s
        scrapers:
          cpu: {}
          disk: {}
          load: {}
          memory: {}
          network: {}
    processors:
      batch: {}
      resource:
        attributes:
          - key: deployment.type
            value: daemonset
            action: upsert
    exporters:
      debug:
        verbosity: normal
    service:
      pipelines:
        traces:
          receivers: [otlp]
          processors: [batch]
          exporters: [debug]
        metrics:
          receivers: [otlp, hostmetrics]
          processors: [batch, resource]
          exporters: [debug]
        logs:
          receivers: [otlp]
          processors: [batch]
          exporters: [debug]
      telemetry:
        metrics:
          readers:
            - pull:
                exporter:
                  prometheus:
                    host: 0.0.0.0
                    port: 8888
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 100m
      memory: 128Mi
EOF

echo "  Waiting for collectors to be created..."
sleep 5

echo -e "${GREEN}✓ Collectors created${NC}"
echo ""

# Step 5: Verify setup
echo "Step 5: Verifying setup..."
echo "----------------------------------------"

# Check bridge CRD and deployment
echo "  Checking OpAMP Bridge..."
if kubectl get opampbridge $BRIDGE_NAME -n opentelemetry-operator-system &> /dev/null; then
    echo -e "    ${GREEN}✓ OpAMPBridge CRD exists (name: $BRIDGE_NAME)${NC}"
    
    # Check deployment (operator creates it as <crd-name>-<crd-name>)
    BRIDGE_DEPLOYMENT_NAME="${BRIDGE_NAME}-${BRIDGE_NAME}"
    if kubectl get deployment $BRIDGE_DEPLOYMENT_NAME -n opentelemetry-operator-system &> /dev/null; then
        echo -e "    ${GREEN}✓ Bridge deployment exists (name: $BRIDGE_DEPLOYMENT_NAME)${NC}"
        BRIDGE_STATUS=$(kubectl get deployment $BRIDGE_DEPLOYMENT_NAME -n opentelemetry-operator-system -o jsonpath='{.status.conditions[?(@.type=="Available")].status}' 2>/dev/null || echo "Unknown")
        if [ "$BRIDGE_STATUS" = "True" ]; then
            echo -e "    ${GREEN}✓ Bridge is available${NC}"
        else
            echo -e "    ${YELLOW}⚠ Bridge is not yet available (status: $BRIDGE_STATUS)${NC}"
        fi
    else
        echo -e "    ${YELLOW}⚠ Bridge deployment not yet created (operator may still be processing)${NC}"
    fi
else
    echo -e "    ${RED}✗ OpAMPBridge CRD not found${NC}"
fi

# Check collectors
echo "  Checking collectors..."
COLLECTORS=("test-simple" "test-collector" "otel-collector-daemonset")
for collector in "${COLLECTORS[@]}"; do
    if kubectl get opentelemetrycollector $collector -n opentelemetry-operator-system &> /dev/null; then
        echo -e "    ${GREEN}✓ $collector exists (namespace: opentelemetry-operator-system)${NC}"
        
        # Check label
        MANAGED_LABEL=$(kubectl get opentelemetrycollector $collector -n opentelemetry-operator-system -o jsonpath='{.metadata.labels.opentelemetry\.io/opamp-managed}' 2>/dev/null || echo "")
        if [ "$MANAGED_LABEL" = "$BRIDGE_NAME" ]; then
            echo -e "      ${GREEN}✓ Label correct: opentelemetry.io/opamp-managed=$MANAGED_LABEL${NC}"
        else
            echo -e "      ${RED}✗ Label incorrect or missing: '$MANAGED_LABEL' (expected: '$BRIDGE_NAME')${NC}"
        fi
    else
        echo -e "    ${RED}✗ $collector not found${NC}"
    fi
done

echo ""

# Step 6: Summary and next steps
echo "=========================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "What was created:"
echo "  1. OpAMP Bridge (opamp-bridge) with correct capabilities"
echo "  2. Three OpenTelemetryCollector CRDs with correct labels:"
echo "     - test-simple (deployment mode)"
echo "     - test-collector (deployment mode, with hostmetrics)"
echo "     - otel-collector-daemonset (daemonset mode)"
echo ""
echo "Key features:"
echo "  ✓ Bridge and collectors in SAME namespace (opentelemetry-operator-system)"
echo "  ✓ All collectors have opentelemetry.io/opamp-managed=true"
echo "  ✓ Bridge has correct capabilities configured"
echo "  ✓ All components allowed (no restrictions)"
echo "  ✓ Telemetry enabled on all collectors (Prometheus metrics on port 8888)"
echo ""
echo "Next steps:"
echo "  1. Wait 30-60 seconds for bridge to discover collectors"
echo "  2. Check bridge logs:"
echo "     kubectl logs -n opentelemetry-operator-system -l app.kubernetes.io/name=opamp-bridge -f"
echo "  3. Check backend logs for 'DISCOVERED COLLECTOR' messages"
echo "  4. Verify collectors appear in UI as separate agents"
echo ""
echo "To verify labels:"
echo "  kubectl get opentelemetrycollectors --all-namespaces -L opentelemetry.io/opamp-managed"
echo ""
echo "To check bridge status:"
echo "  kubectl get opampbridge $BRIDGE_NAME -n opentelemetry-operator-system"
echo "  kubectl get deployment ${BRIDGE_NAME}-${BRIDGE_NAME} -n opentelemetry-operator-system"
echo ""

