#!/bin/bash

set -euo pipefail

: "${MYSQL_HOST:=mysql}"
: "${MYSQL_USER:=root}"
: "${MYSQL_PASSWORD:=root}"
: "${MYSQL_DATABASE:=grafana_agents}"

mysql_cmd() {
  mysql -h"${MYSQL_HOST}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" "$@"
}

echo "seed-demo-data: waiting for MySQL @ ${MYSQL_HOST}..."
until mysql -h"${MYSQL_HOST}" -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" -e "SELECT 1" >/dev/null 2>&1; do
  sleep 2
done

echo "seed-demo-data: waiting for migrations to create target tables..."
until mysql_cmd -Nse "SHOW TABLES LIKE 'organizations';" | grep -q organizations; do
  sleep 2
done

echo "seed-demo-data: applying seed data..."
mysql_cmd < /seed/seed.sql

echo "seed-demo-data: seed completed."

