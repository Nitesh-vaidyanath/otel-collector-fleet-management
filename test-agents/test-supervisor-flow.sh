#!/bin/bash
# Test Script: OpAMP Supervisor Flow
# Tests the official supervisor approach

set -e

echo "=== Testing OpAMP Supervisor Flow ==="
echo ""

cd "$(dirname "$0")"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check prerequisites
echo "Step 1: Checking prerequisites..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker is not installed${NC}"
    exit 1
fi
if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}✗ Docker Compose is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker and Docker Compose found${NC}"

# Step 2: Check if Grafana/OpAMP server is running
echo ""
echo "Step 2: Checking OpAMP server..."
if curl -s http://localhost:4321/v1/opamp > /dev/null 2>&1 || curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ OpAMP server detected${NC}"
else
    echo -e "${YELLOW}⚠ OpAMP server not detected on localhost:4321${NC}"
    echo "   Start Grafana with: cd .. && docker compose up -d"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 3: Build and start supervisor
echo ""
echo "Step 3: Building supervisor container..."
docker compose -f docker-compose.with-supervisor.yml build

echo ""
echo "Step 4: Starting supervisor..."
docker compose -f docker-compose.with-supervisor.yml up -d

# Step 5: Wait for supervisor to start
echo ""
echo "Step 5: Waiting for supervisor to start..."
sleep 5

# Step 6: Check logs
echo ""
echo "Step 6: Checking supervisor logs..."
docker compose -f docker-compose.with-supervisor.yml logs --tail 20

# Step 7: Check if collector is running
echo ""
echo "Step 7: Verifying collector process..."
if docker exec otel-agent-supervisor pgrep otelcol-contrib > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Collector process is running${NC}"
else
    echo -e "${YELLOW}⚠ Collector process not found (may still be starting)${NC}"
fi

# Step 8: Test OpAMP connection
echo ""
echo "Step 8: Testing OpAMP connection from container..."
if docker exec otel-agent-supervisor curl -s http://host.docker.internal:4321/v1/opamp > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Can reach OpAMP server from container${NC}"
else
    echo -e "${RED}✗ Cannot reach OpAMP server from container${NC}"
    echo "   Check network configuration"
fi

echo ""
echo "=== Test Summary ==="
echo "Supervisor container: otel-agent-supervisor"
echo "View logs: docker compose -f docker-compose.with-supervisor.yml logs -f"
echo "Stop: docker compose -f docker-compose.with-supervisor.yml down"
echo ""
echo "Next steps:"
echo "1. Check Grafana UI - agent should appear in fleet"
echo "2. Push configuration from Grafana UI"
echo "3. Verify config is applied (check supervisor logs)"

