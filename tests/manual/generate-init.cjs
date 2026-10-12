#!/usr/bin/env node
// Build a MySQL 8 init script from the app's migrations for a fresh manual-test DB.
// Only MySQL-incompatible IF NOT EXISTS clauses on ALTER ADD COLUMN/CREATE INDEX
// are removed. Production migration files are read-only inputs.
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const migrationsDir = path.join(repoRoot, 'opamp-server/pkg/migrations');
const outputPath = path.join(__dirname, 'generated/init.sql');
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort((a, b) => a.localeCompare(b));

if (migrationFiles.length === 0) throw new Error('No numbered migrations found');

const chunks = [];
for (const file of migrationFiles) {
  let sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  sql = sql.replace(/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi, 'ADD COLUMN');
  sql = sql.replace(/\bCREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\b/gi, 'CREATE INDEX');
  chunks.push(`-- Source migration: ${file}\n${sql.trim()}\n`);
}

// These enum values are required by the current backend but are deliberately
// fixture-only so production migrations remain unchanged.
chunks.push(`-- Manual-test-only values used by the current backend.
ALTER TABLE agents
  MODIFY COLUMN status ENUM('online','offline','degraded','unclassified') DEFAULT 'offline';

ALTER TABLE agent_telemetry
  MODIFY COLUMN telemetry_type ENUM('metrics','logs','traces','health','pipeline_status','remote_config_status') NOT NULL;

-- Map only the synthetic Grafana org 1 to the generated default org for this fixture.
UPDATE organizations SET grafana_org_id=1 WHERE id=1;
`);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${chunks.join('\n')}\n`, { mode: 0o600 });
process.stdout.write(`Generated ${path.relative(repoRoot, outputPath)} from ${migrationFiles.length} migrations.\n`);
