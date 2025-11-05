#!/bin/bash
# Install OpenTelemetry Operator for Kubernetes
# Works with Docker Desktop K8s cluster
# Reference: https://opentelemetry.io/docs/platforms/kubernetes/operator/

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== Installing OpenTelemetry Operator ==="
echo ""

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl is not installed${NC}"
    exit 1
fi

# Check cluster connection
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}❌ Cannot connect to Kubernetes cluster${NC}"
    echo "   Make sure Docker Desktop Kubernetes is enabled"
    exit 1
fi

echo -e "${GREEN}✓ Kubernetes cluster detected${NC}"
echo ""

# Step 1: Check for cert-manager (required by operator)
echo "Step 1: Checking for cert-manager..."
if kubectl get crd certificates.cert-manager.io &> /dev/null; then
    echo -e "${GREEN}✓ cert-manager CRDs found${NC}"
    CERT_MANAGER_INSTALLED=true
else
    echo -e "${YELLOW}⚠ cert-manager not found${NC}"
    CERT_MANAGER_INSTALLED=false
fi

# Install cert-manager if needed
if [ "$CERT_MANAGER_INSTALLED" = false ]; then
    echo ""
    echo "Step 2: Installing cert-manager (required by operator)..."
    echo "  Installing cert-manager CRDs..."
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
    
    echo ""
    echo "  Waiting for cert-manager to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment/cert-manager -n cert-manager || true
    kubectl wait --for=condition=available --timeout=300s deployment/cert-manager-webhook -n cert-manager || true
    kubectl wait --for=condition=available --timeout=300s deployment/cert-manager-cainjector -n cert-manager || true
    
    echo ""
    echo "  Waiting for cert-manager CRDs to be ready..."
    kubectl wait --for=condition=Established crd certificates.cert-manager.io --timeout=60s || true
    kubectl wait --for=condition=Established crd issuers.cert-manager.io --timeout=60s || true
    
    echo -e "${GREEN}✓ cert-manager installed${NC}"
else
    echo -e "${GREEN}✓ cert-manager already installed${NC}"
fi

# Step 3: Create namespace
echo ""
echo "Step 3: Creating namespace..."
kubectl create namespace opentelemetry-operator-system --dry-run=client -o yaml | kubectl apply -f -

# Step 4: Install operator
echo ""
echo "Step 4: Installing OpenTelemetry Operator..."
echo "  Reference: https://opentelemetry.io/docs/platforms/kubernetes/operator/"
kubectl apply -f https://github.com/open-telemetry/opentelemetry-operator/releases/latest/download/opentelemetry-operator.yaml

# Wait for operator to be ready
echo ""
echo "Step 5: Waiting for operator to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/opentelemetry-operator-controller-manager -n opentelemetry-operator-system

echo ""
echo -e "${GREEN}✓ OpenTelemetry Operator installed successfully${NC}"
echo ""
echo "Verify installation:"
echo "  kubectl get pods -n opentelemetry-operator-system"
echo "  kubectl get crd | grep opentelemetry"

