#!/bin/bash
# Run database migrations for OTel Collector Agent Fleet Management

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "Running database migrations..."

# Get database connection from environment or use defaults
DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-grafana}"
DB_PASSWORD="${DB_PASSWORD:-grafana123}"
DB_NAME="${DB_NAME:-grafana_agents}"

# Check if running via docker-compose
if docker compose ps grafana_mysql 2>/dev/null | grep -q "running"; then
    echo -e "${GREEN}Using Docker MySQL container${NC}"
    for migration in opamp-server/pkg/migrations/*.sql; do
        if [ -f "$migration" ]; then
            echo "  Running: $(basename $migration)"
            docker compose exec -T mysql mysql -uroot -proot "$DB_NAME" < "$migration" 2>/dev/null || true
        fi
    done
    echo -e "${GREEN}✓ Migrations complete${NC}"
else
    echo -e "${YELLOW}MySQL container not running. Please start it first:${NC}"
    echo "  docker compose up -d mysql"
    echo "  or"
    echo "  make docker-up"
    exit 1
fi

