#!/bin/bash
# Test All Flows: Run all test scripts sequentially

set -e

echo "=== Testing All Agent Flows ==="
echo ""

cd "$(dirname "$0")"

SCRIPTS=(
    "test-supervisor-flow.sh"
    "test-simple-agents-flow.sh"
)

for script in "${SCRIPTS[@]}"; do
    if [ -f "$script" ]; then
        echo ""
        echo "========================================"
        echo "Running: $script"
        echo "========================================"
        echo ""
        
        # Run script (continue on error to test all)
        bash "$script" || echo "Script $script had errors (continuing...)"

        echo ""
        read -p "Press Enter to continue to next test..."
    fi
done

echo ""
echo "=== All Tests Complete ==="

