#!/bin/bash

echo "=== OpAMP Bridge Diagnostics ==="
echo ""

echo "1. Checking OpAMP Bridge pod status..."
kubectl -n opentelemetry-operator-system get pods -l app.kubernetes.io/name=opamp-bridge
echo ""

echo "2. Checking OpenTelemetryCollector CRDs..."
kubectl -n opentelemetry-operator-system get opentelemetrycollectors -o wide
echo ""

echo "3. Checking opamp-managed labels on collectors..."
echo "   otel-collector-daemonset:"
kubectl -n opentelemetry-operator-system get opentelemetrycollector otel-collector-daemonset -o jsonpath='{.metadata.labels.opentelemetry\.io/opamp-managed}' 2>/dev/null || echo "   Label not found"
echo ""
echo "   test-collector:"
kubectl -n opentelemetry-operator-system get opentelemetrycollector test-collector -o jsonpath='{.metadata.labels.opentelemetry\.io/opamp-managed}' 2>/dev/null || echo "   Label not found"
echo ""

echo "4. Checking OpAMP Bridge configuration..."
kubectl -n opentelemetry-operator-system get opampbridge -o yaml 2>/dev/null || echo "   No OpAMPBridge CRD found"
echo ""

echo "5. Checking OpAMP Bridge logs (last 50 lines)..."
BRIDGE_POD=$(kubectl -n opentelemetry-operator-system get pods -l app.kubernetes.io/name=opamp-bridge -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -n "$BRIDGE_POD" ]; then
    kubectl -n opentelemetry-operator-system logs "$BRIDGE_POD" --tail=50
else
    echo "   No OpAMP Bridge pod found"
fi
echo ""

echo "6. Checking collector pod status..."
echo "   All collector pods:"
kubectl -n opentelemetry-operator-system get pods -l app.kubernetes.io/managed-by=opentelemetry-operator
echo ""

echo "=== Diagnostics Complete ==="
echo ""
echo "To fix missing opamp-managed labels, run:"
echo "  kubectl -n opentelemetry-operator-system label opentelemetrycollector otel-collector-daemonset opentelemetry.io/opamp-managed=true --overwrite"
echo "  kubectl -n opentelemetry-operator-system label opentelemetrycollector test-collector opentelemetry.io/opamp-managed=true --overwrite"

