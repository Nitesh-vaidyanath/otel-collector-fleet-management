#!/bin/bash
# Test Script: Simple Agents Flow (Without Supervisor)
# Tests basic agents that connect directly to OpAMP

set -e

echo "=== Testing Simple Agents Flow ==="
echo ""

cd "$(dirname "$0")"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check prerequisites
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker is not installed${NC}"
    exit 1
fi

# Check OpAMP server
echo "Checking OpAMP server..."
if curl -s http://localhost:4321/v1/opamp > /dev/null 2>&1; then
    echo -e "${GREEN}✓ OpAMP server detected${NC}"
else
    echo -e "${YELLOW}⚠ OpAMP server not detected${NC}"
fi

# Start agents
echo ""
echo "Starting test agents..."
docker compose -f docker-compose.test-agents.yml up -d

echo ""
echo "Waiting for agents to start..."
sleep 5

# Check status
echo ""
echo "Agent status:"
docker compose -f docker-compose.test-agents.yml ps

echo ""
echo "Agent logs (last 10 lines each):"
docker compose -f docker-compose.test-agents.yml logs --tail 10

echo ""
echo "=== Test Summary ==="
echo "Agents started: otel-agent-1, otel-agent-2, otel-agent-3"
echo "View logs: docker compose -f docker-compose.test-agents.yml logs -f"
echo "Stop: docker compose -f docker-compose.test-agents.yml down"

