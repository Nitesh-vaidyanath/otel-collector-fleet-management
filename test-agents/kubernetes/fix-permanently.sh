#!/bin/bash
# Permanent Fix for OpAMP Label Issues
# This script ensures everything is configured correctly and stays that way

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "OpAMP Permanent Fix Script"
echo "=========================================="
echo ""

# Step 1: Run clean setup
echo "Step 1: Running clean setup..."
echo "----------------------------------------"
./setup-clean.sh

echo ""
echo "Step 2: Waiting for resources to stabilize..."
echo "----------------------------------------"
sleep 10

# Step 3: Verify bridge
echo ""
echo "Step 3: Verifying bridge..."
echo "----------------------------------------"

# CRITICAL: Use OpAMPBridge CRD name, NOT deployment name
# CRD name: opamp-bridge
# Deployment name: opamp-bridge-opamp-bridge
# Label value: opamp-bridge (the CRD name)
BRIDGE_NAME="opamp-bridge"
BRIDGE_DEPLOYMENT_NAME="${BRIDGE_NAME}-${BRIDGE_NAME}"
if kubectl get deployment $BRIDGE_DEPLOYMENT_NAME -n opentelemetry-operator-system &> /dev/null; then
    echo -e "${GREEN}✓ Bridge deployment exists${NC}"
    
    # Check capabilities
    CAPABILITIES=$(kubectl get opampbridge opamp-bridge -n opentelemetry-operator-system -o json | jq -r '.spec.capabilities | keys[]' 2>/dev/null | sort)
    echo "  Bridge capabilities:"
    echo "$CAPABILITIES" | while read cap; do
        echo "    - $cap"
    done
    
    # Verify required capabilities
    REQUIRED_CAPS=("AcceptsRemoteConfig" "ReportsEffectiveConfig" "ReportsHealth" "ReportsRemoteConfig" "ReportsRemoteConfigStatus")
    MISSING_CAPS=()
    for cap in "${REQUIRED_CAPS[@]}"; do
        if ! echo "$CAPABILITIES" | grep -q "^$cap$"; then
            MISSING_CAPS+=("$cap")
        fi
    done
    
    if [ ${#MISSING_CAPS[@]} -eq 0 ]; then
        echo -e "  ${GREEN}✓ All required capabilities present${NC}"
    else
        echo -e "  ${RED}✗ Missing capabilities: ${MISSING_CAPS[*]}${NC}"
        echo "  Run: kubectl delete opampbridge opamp-bridge -n opentelemetry-operator-system"
        echo "  Then re-run this script"
        exit 1
    fi
else
    echo -e "${RED}✗ Bridge deployment not found${NC}"
    exit 1
fi

# Step 4: Verify all collectors have correct label
echo ""
echo "Step 4: Verifying collector labels..."
echo "----------------------------------------"

ALL_OK=true
COLLECTORS=$(kubectl get opentelemetrycollectors --all-namespaces -o json | jq -r '.items[] | "\(.metadata.namespace)/\(.metadata.name)"')

if [ -z "$COLLECTORS" ]; then
    echo -e "${YELLOW}⚠ No collectors found${NC}"
else
    for collector in $COLLECTORS; do
        namespace=$(echo $collector | cut -d'/' -f1)
        name=$(echo $collector | cut -d'/' -f2)
        
        LABEL=$(kubectl get opentelemetrycollector $name -n $namespace -o jsonpath='{.metadata.labels.opentelemetry\.io/opamp-managed}' 2>/dev/null)
        
        if [ "$LABEL" = "$BRIDGE_NAME" ]; then
            echo -e "  ${GREEN}✓${NC} $namespace/$name: opentelemetry.io/opamp-managed=$LABEL"
        else
            echo -e "  ${RED}✗${NC} $namespace/$name: opentelemetry.io/opamp-managed=${LABEL:-MISSING} (expected: $BRIDGE_NAME)"
            ALL_OK=false
        fi
    done
fi

if [ "$ALL_OK" = false ]; then
    echo ""
    echo -e "${RED}Some collectors have incorrect labels!${NC}"
    echo "Re-running setup..."
    ./setup-clean.sh
    exit 1
fi

# Step 5: Restart bridge to refresh cache
echo ""
echo "Step 5: Restarting bridge to refresh cache..."
echo "----------------------------------------"
kubectl rollout restart deployment $BRIDGE_DEPLOYMENT_NAME -n opentelemetry-operator-system
echo "  Waiting for rollout..."
kubectl rollout status deployment $BRIDGE_DEPLOYMENT_NAME -n opentelemetry-operator-system --timeout=60s

# Step 6: Wait for bridge to discover collectors
echo ""
echo "Step 6: Waiting for bridge to discover collectors..."
echo "----------------------------------------"
sleep 15

# Step 7: Check bridge logs for discovery
echo ""
echo "Step 7: Checking bridge logs..."
echo "----------------------------------------"
LOGS=$(kubectl logs -n opentelemetry-operator-system -l app.kubernetes.io/name=opamp-bridge --tail=50 | grep -i "discovered\|effectiveconfig\|collector" | tail -10)
if [ -n "$LOGS" ]; then
    echo "$LOGS"
else
    echo "  No discovery messages yet (this is normal if collectors just started)"
fi

# Step 8: Final verification
echo ""
echo "Step 9: Final verification..."
echo "----------------------------------------"

echo "  Checking which agents will appear in backend..."
echo ""
echo "  Agents that should appear:"
kubectl get opentelemetrycollectors --all-namespaces -o json | jq -r '.items[] | "  - \(.metadata.namespace)/\(.metadata.name)"'

echo ""
echo "=========================================="
echo -e "${GREEN}Permanent Fix Complete!${NC}"
echo "=========================================="
echo ""
echo "What was fixed:"
echo "  1. Bridge has all required capabilities"
echo "  2. All collectors have correct label: $BRIDGE_NAME"
echo "  3. Bridge cache refreshed"
echo ""
echo "Next steps:"
echo "  1. Wait 30 seconds for backend to discover collectors"
echo "  2. Refresh UI - you should see 3 collectors (NOT the bridge)"
echo "  3. Select a COLLECTOR (test-simple, test-collector, or otel-collector-daemonset)"
echo "  4. Push config - should work now"
echo ""
echo -e "${YELLOW}IMPORTANT:${NC}"
echo "  - DO NOT push config to the bridge (opamp-bridge)"
echo "  - ONLY push to collectors (they have k8s.namespace and k8s.crd_name labels)"
echo "  - If you see 'opamp-bridge' in the UI, it will be filtered out automatically"
echo ""
echo "To verify:"
echo "  kubectl get opentelemetrycollectors --all-namespaces -L opentelemetry.io/opamp-managed"
echo ""
echo "To monitor:"
echo "  kubectl logs -n opentelemetry-operator-system -l app.kubernetes.io/name=opamp-bridge -f"
echo ""

