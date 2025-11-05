#!/bin/bash
# Fix RBAC Permissions for OpAMP Bridge
# Grants the OpAMP Bridge service account permission to create, update, and delete OpenTelemetryCollector CRDs

set -e

echo "=========================================="
echo "Fixing OpAMP Bridge RBAC Permissions"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

NAMESPACE="opentelemetry-operator-system"
SERVICE_ACCOUNT="opamp-bridge"
ROLE_NAME="opamp-bridge-collector-manager"
ROLE_BINDING_NAME="opamp-bridge-collector-manager"

echo -e "${YELLOW}Step 1: Creating Role with full OpenTelemetryCollector permissions...${NC}"

# Create Role with permissions to manage OpenTelemetryCollector CRDs
kubectl apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ${ROLE_NAME}
  namespace: ${NAMESPACE}
rules:
- apiGroups:
  - opentelemetry.io
  resources:
  - opentelemetrycollectors
  verbs:
  - get
  - list
  - watch
  - create
  - update
  - patch
  - delete
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Role created successfully${NC}"
else
    echo -e "${RED}✗ Failed to create Role${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 2: Creating RoleBinding to grant permissions to OpAMP Bridge...${NC}"

# Create RoleBinding
kubectl apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ${ROLE_BINDING_NAME}
  namespace: ${NAMESPACE}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${ROLE_NAME}
subjects:
- kind: ServiceAccount
  name: ${SERVICE_ACCOUNT}
  namespace: ${NAMESPACE}
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ RoleBinding created successfully${NC}"
else
    echo -e "${RED}✗ Failed to create RoleBinding${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 3: Verifying permissions...${NC}"

# Check if ServiceAccount exists
if kubectl get serviceaccount ${SERVICE_ACCOUNT} -n ${NAMESPACE} &> /dev/null; then
    echo -e "${GREEN}✓ ServiceAccount ${SERVICE_ACCOUNT} exists${NC}"
else
    echo -e "${RED}✗ ServiceAccount ${SERVICE_ACCOUNT} not found${NC}"
    echo -e "${YELLOW}Creating ServiceAccount...${NC}"
    kubectl create serviceaccount ${SERVICE_ACCOUNT} -n ${NAMESPACE} || true
fi

# Check if Role exists
if kubectl get role ${ROLE_NAME} -n ${NAMESPACE} &> /dev/null; then
    echo -e "${GREEN}✓ Role ${ROLE_NAME} exists${NC}"
else
    echo -e "${RED}✗ Role ${ROLE_NAME} not found${NC}"
    exit 1
fi

# Check if RoleBinding exists
if kubectl get rolebinding ${ROLE_BINDING_NAME} -n ${NAMESPACE} &> /dev/null; then
    echo -e "${GREEN}✓ RoleBinding ${ROLE_BINDING_NAME} exists${NC}"
else
    echo -e "${RED}✗ RoleBinding ${ROLE_BINDING_NAME} not found${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=========================================="
echo "RBAC Permissions Fixed!"
echo "==========================================${NC}"
echo ""
echo "The OpAMP Bridge can now:"
echo "  ✓ Get, list, watch OpenTelemetryCollector CRDs"
echo "  ✓ Create new OpenTelemetryCollector CRDs"
echo "  ✓ Update existing OpenTelemetryCollector CRDs"
echo "  ✓ Delete OpenTelemetryCollector CRDs"
echo ""
echo -e "${YELLOW}Note: If you're still seeing permission errors, you may need to restart the OpAMP Bridge pod:${NC}"
echo "  kubectl rollout restart deployment/opamp-bridge-opamp-bridge -n ${NAMESPACE}"
echo ""

