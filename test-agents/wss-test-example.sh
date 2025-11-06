#!/bin/bash
# WSS/TLS Test Example
# This script generates self-signed certificates for testing TLS-enabled OpAMP server

set -e

echo "🔒 WSS/TLS Test Setup for OpAMP Server"
echo "======================================"
echo ""

# Create certs directory
CERTS_DIR="./certs"
mkdir -p "$CERTS_DIR"

# Generate self-signed certificate
echo "📝 Generating self-signed certificate..."
openssl req -x509 -newkey rsa:4096 \
  -keyout "$CERTS_DIR/opamp-key.pem" \
  -out "$CERTS_DIR/opamp-cert.pem" \
  -days 365 -nodes \
  -subj "/CN=localhost" \
  2>/dev/null

# Set permissions
chmod 600 "$CERTS_DIR/opamp-key.pem"
chmod 644 "$CERTS_DIR/opamp-cert.pem"

echo "✓ Certificate generated successfully"
echo ""
echo "📂 Certificate files:"
echo "   - Certificate: $CERTS_DIR/opamp-cert.pem"
echo "   - Private Key: $CERTS_DIR/opamp-key.pem"
echo ""
echo "🚀 Next Steps:"
echo ""
echo "Option 1: Standalone OpAMP Server with TLS"
echo "-------------------------------------------"
echo "./opamp-server \\"
echo "  -endpoint=\"0.0.0.0:4321\" \\"
echo "  -tls \\"
echo "  -cert=\"$CERTS_DIR/opamp-cert.pem\" \\"
echo "  -key=\"$CERTS_DIR/opamp-key.pem\" \\"
echo "  -db-dsn=\"root:root@tcp(localhost:3306)/grafana_agents\""
echo ""
echo "Option 2: Embedded Server (Docker Compose)"
echo "-------------------------------------------"
echo "Add to docker-compose.yml:"
echo ""
echo "services:"
echo "  grafana:"
echo "    environment:"
echo "      OPAMP_TLS_CERT: \"/etc/ssl/opamp-cert.pem\""
echo "      OPAMP_TLS_KEY: \"/etc/ssl/opamp-key.pem\""
echo "    volumes:"
echo "      - ./$CERTS_DIR/opamp-cert.pem:/etc/ssl/opamp-cert.pem:ro"
echo "      - ./$CERTS_DIR/opamp-key.pem:/etc/ssl/opamp-key.pem:ro"
echo ""
echo "Then run: docker-compose up -d"
echo ""
echo "Option 3: Test Agent Configuration"
echo "-----------------------------------"
echo "Update your collector config to use wss://"
echo ""
echo "extensions:"
echo "  opamp:"
echo "    server:"
echo "      ws:"
echo "        endpoint: wss://localhost:4321/v1/opamp"
echo "        tls:"
echo "          insecure_skip_verify: true  # For self-signed certs in testing"
echo ""
echo "📚 Documentation: docs/WSS_TLS_SETUP.md"

