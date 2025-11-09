-- Seed demo organizations for Grafana OpAMP demo
SET NAMES utf8mb4;

INSERT INTO organizations (id, name, description)
VALUES (1, 'Default Organization', 'Default organization for agents')
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description);

INSERT INTO organizations (id, name, description)
VALUES 
  (2, 'Tenant Alpha', 'Agents that rely on tenant.name label resolution'),
  (3, 'Org Bravo', 'Collectors pinned directly by org_id'),
  (4, 'Tenant Delta', 'Collectors connected via tenant label mapping')
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description);

