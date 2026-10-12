#!/usr/bin/env node
// Build the isolated manual-test MySQL init script from the one fresh-install
// baseline. This does not modify a database or create an upgrade bundle.
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const migrationsDir = path.join(repoRoot, 'opamp-server/pkg/migrations');
const outputPath = path.join(__dirname, 'generated/init.sql');
const schemaFiles = fs.readdirSync(migrationsDir)
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort((a, b) => a.localeCompare(b));

if (schemaFiles.length !== 1 || schemaFiles[0] !== '0001_initial_schema.sql') {
  throw new Error(`Expected the single fresh-install schema 0001_initial_schema.sql; found: ${schemaFiles.join(', ') || '(none)'}`);
}

const schema = fs.readFileSync(path.join(migrationsDir, schemaFiles[0]), 'utf8').trim();

const fixture = `-- Synthetic manual-test mapping only; no real Grafana organization is touched.
UPDATE organizations SET grafana_org_id=1 WHERE id=1;`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${schema}\n\n${fixture}\n`, { mode: 0o600 });
process.stdout.write(`Generated ${path.relative(repoRoot, outputPath)} from ${schemaFiles[0]}.\n`);
