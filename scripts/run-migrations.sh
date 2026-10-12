#!/usr/bin/env bash
# Initialize an empty local Compose MySQL database from the single baseline.
# This intentionally refuses to alter or upgrade a populated database.
set -euo pipefail

DB_NAME="${DB_NAME:-grafana_agents}"
SCHEMA_FILE="opamp-server/pkg/migrations/0001_initial_schema.sql"

if [[ ! "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "DB_NAME must contain only letters, digits, and underscores." >&2
  exit 2
fi
if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "Baseline schema not found: $SCHEMA_FILE" >&2
  exit 2
fi
if ! docker compose ps --status running --services mysql | grep -Fxq mysql; then
  echo "The root Compose mysql service is not running. Start it first with: docker compose up -d mysql" >&2
  exit 1
fi

table_count="$(docker compose exec -T mysql sh -c \
  'export MYSQL_PWD="${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is not configured}"; exec mysql -uroot --batch --skip-column-names "$1" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()"' \
  sh "$DB_NAME")"
if [[ ! "$table_count" =~ ^[0-9]+$ ]]; then
  echo "Could not determine whether database '$DB_NAME' is empty; refusing to apply schema." >&2
  exit 1
fi
if (( table_count != 0 )); then
  echo "Database '$DB_NAME' already contains $table_count tables. This is a fresh-install initializer, not an upgrade; no changes made." >&2
  exit 1
fi

echo "Initializing empty local database '$DB_NAME' from the single MySQL baseline..."
docker compose exec -T mysql sh -c \
  'export MYSQL_PWD="${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is not configured}"; exec mysql -uroot --default-character-set=utf8mb4 "$1"' \
  sh "$DB_NAME" < "$SCHEMA_FILE"
echo "Schema initialization complete. No existing data was modified."
