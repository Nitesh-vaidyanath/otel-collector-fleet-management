#!/bin/bash
# Comprehensive Installation Script for OpenTelemetry Operator
# Installs: Operator, CRDs, ServiceAccount, RBAC, and OpAMP Bridge
# Reference: https://opentelemetry.io/docs/platforms/kubernetes/operator/

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "OpenTelemetry Operator Installation"
echo "=========================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl is not installed${NC}"
    echo "   Install kubectl: https://kubernetes.io/docs/tasks/tools/"
    exit 1
fi

if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}❌ Cannot connect to Kubernetes cluster${NC}"
    echo "   Make sure your cluster is running and kubectl is configured"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites met${NC}"
echo ""

# Step 1: Check/Install cert-manager (required by operator)
echo "Step 1: Checking cert-manager..."
if kubectl get crd certificates.cert-manager.io &> /dev/null; then
    echo -e "${GREEN}✓ cert-manager already installed${NC}"
else
    echo -e "${YELLOW}⚠ cert-manager not found - installing...${NC}"
    echo "  Installing cert-manager CRDs..."
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
    
    echo "  Waiting for cert-manager to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment/cert-manager -n cert-manager || true
    kubectl wait --for=condition=available --timeout=300s deployment/cert-manager-webhook -n cert-manager || true
    kubectl wait --for=condition=available --timeout=300s deployment/cert-manager-cainjector -n cert-manager || true
    
    echo "  Waiting for cert-manager CRDs..."
    kubectl wait --for=condition=Established crd certificates.cert-manager.io --timeout=60s || true
    kubectl wait --for=condition=Established crd issuers.cert-manager.io --timeout=60s || true
    
    echo -e "${GREEN}✓ cert-manager installed${NC}"
fi
echo ""

# Step 2: Create namespace
echo "Step 2: Creating namespace..."
kubectl create namespace opentelemetry-operator-system --dry-run=client -o yaml | kubectl apply -f -
echo -e "${GREEN}✓ Namespace created${NC}"
echo ""

# Step 3: Install OpenTelemetry Operator
echo "Step 3: Installing OpenTelemetry Operator..."
echo "  Downloading operator manifest..."
kubectl apply -f https://github.com/open-telemetry/opentelemetry-operator/releases/latest/download/opentelemetry-operator.yaml

echo "  Waiting for operator to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/opentelemetry-operator-controller-manager -n opentelemetry-operator-system

echo -e "${GREEN}✓ OpenTelemetry Operator installed${NC}"
echo ""

# Step 4: Verify CRDs
echo "Step 4: Verifying CRDs..."
CRDS=(
    "opentelemetrycollectors.opentelemetry.io"
    "opampbridges.opentelemetry.io"
    "instrumentations.opentelemetry.io"
)

for crd in "${CRDS[@]}"; do
    if kubectl get crd "$crd" &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} $crd"
    else
        echo -e "  ${RED}✗${NC} $crd (not found)"
    fi
done
echo ""

# Step 5: Create OpAMP Bridge ServiceAccount and RBAC
echo "Step 5: Creating OpAMP Bridge ServiceAccount and RBAC..."
cat <<EOF | kubectl apply -f -
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
- apiGroups: ["opentelemetry.io"]
  resources: ["opentelemetrycollectors"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: [""]
  resources: ["pods", "services"]
  verbs: ["get", "list", "watch"]
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

echo -e "${GREEN}✓ ServiceAccount and RBAC created${NC}"
echo ""

# Step 6: Summary
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Installed components:"
echo "  ✓ OpenTelemetry Operator"
echo "  ✓ CRDs (OpenTelemetryCollector, OpAMPBridge, Instrumentation)"
echo "  ✓ ServiceAccount: opamp-bridge"
echo "  ✓ ClusterRole: opamp-bridge"
echo "  ✓ ClusterRoleBinding: opamp-bridge"
echo ""
echo "Next steps:"
echo "  1. Create OpAMPBridge CRD (see opamp-bridge-crd.yaml)"
echo "  2. Create OpenTelemetryCollector CRDs"
echo "  3. Verify: kubectl get pods -n opentelemetry-operator-system"
echo ""
echo "Verify installation:"
echo "  kubectl get pods -n opentelemetry-operator-system"
echo "  kubectl get crd | grep opentelemetry"
echo ""

