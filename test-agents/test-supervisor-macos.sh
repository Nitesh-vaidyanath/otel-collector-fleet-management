#!/bin/bash
# Test OpAMP Supervisor on macOS (Native, not Docker)
# Reference: https://opentelemetry.io/docs/collector/management/

set -e

echo "=== OpAMP Supervisor Test on macOS ==="
echo ""

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    SUP_ARCH="arm64"
    COLLECTOR_ARCH="arm64"
else
    SUP_ARCH="amd64"
    COLLECTOR_ARCH="amd64"
fi

echo "Detected architecture: $ARCH"
echo ""

# Directory setup
TEST_DIR="$HOME/opamp-test"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

echo "Test directory: $TEST_DIR"
echo ""

# Step 1: Download OpAMP Supervisor
echo "Step 1: Downloading OpAMP Supervisor..."
SUPERVISOR_URL="https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/cmd%2Fopampsupervisor%2Fv0.138.0/opampsupervisor_0.138.0_darwin_${SUP_ARCH}"
if [ ! -f "./opampsupervisor" ]; then
    curl --proto '=https' --tlsv1.2 -fL -o ./opampsupervisor "$SUPERVISOR_URL"
    chmod +x ./opampsupervisor
    echo "✓ Supervisor downloaded"
else
    echo "✓ Supervisor already exists"
fi

# Step 2: Download OpenTelemetry Collector
echo ""
echo "Step 2: Downloading OpenTelemetry Collector..."
# Check if Homebrew version exists
if command -v otelcol-contrib &> /dev/null; then
    COLLECTOR_BINARY=$(which otelcol-contrib)
    echo "✓ Using Homebrew collector: $COLLECTOR_BINARY"
else
    # Download from releases
    COLLECTOR_URL="https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.138.0/otelcol-contrib_0.138.0_darwin_${COLLECTOR_ARCH}.tar.gz"
    if [ ! -f "./otelcol-contrib" ]; then
        echo "Downloading collector..."
        curl -L "$COLLECTOR_URL" -o collector.tar.gz
        tar -xzf collector.tar.gz
        mv otelcol-contrib*/otelcol-contrib ./otelcol-contrib || mv otelcol-contrib ./otelcol-contrib
        chmod +x ./otelcol-contrib
        rm -f collector.tar.gz otelcol-contrib*.tar.gz 2>/dev/null || true
        echo "✓ Collector downloaded"
    else
        echo "✓ Collector already exists"
    fi
    COLLECTOR_BINARY="$TEST_DIR/otelcol-contrib"
fi

# Step 3: Create supervisor config
echo ""
echo "Step 3: Creating supervisor configuration..."
cat > supervisor.yaml <<EOF
server:
  endpoint: ws://localhost:4321/v1/opamp
  tls:
    insecure_skip_verify: true

capabilities:
  accepts_remote_config: true
  reports_effective_config: true
  reports_own_metrics: false
  reports_own_logs: true
  reports_own_traces: false
  reports_health: true
  reports_remote_config: true

agent:
  executable: $COLLECTOR_BINARY

storage:
  directory: $TEST_DIR/storage
EOF

echo "✓ Configuration created"
echo ""
echo "Configuration file: $TEST_DIR/supervisor.yaml"
echo "Collector binary: $COLLECTOR_BINARY"
echo "Storage directory: $TEST_DIR/storage"
echo ""

# Step 4: Check if OpAMP server is running
echo "Step 4: Checking OpAMP server..."
if curl -s http://localhost:4321/v1/opamp > /dev/null 2>&1 || nc -z localhost 4321 2>/dev/null; then
    echo "✓ OpAMP server detected on localhost:4321"
else
    echo "⚠ WARNING: OpAMP server not detected on localhost:4321"
    echo "   Make sure Grafana is running with OpAMP server enabled"
    echo "   Or start the backend: cd ../backend-service && make run"
fi

echo ""
echo "=== Ready to Start Supervisor ==="
echo ""
echo "To start the supervisor, run:"
echo "  cd $TEST_DIR"
echo "  ./opampsupervisor --config=./supervisor.yaml"
echo ""
echo "Or run it in the background:"
echo "  ./opampsupervisor --config=./supervisor.yaml > supervisor.log 2>&1 &"
echo ""
read -p "Start supervisor now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Starting supervisor..."
    ./opampsupervisor --config=./supervisor.yaml
fi

