-- Create bridges table to track OpAMP Bridges separately from collectors
-- Bridges are NOT collectors - they manage collectors
CREATE TABLE IF NOT EXISTS bridges (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  org_id BIGINT NOT NULL,
  bridge_uid VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  version VARCHAR(64),
  status ENUM('online','offline','degraded') DEFAULT 'offline',
  last_seen_at DATETIME,
  labels_json JSON,
  capabilities_json JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_bridgeuid (org_id, bridge_uid),
  KEY idx_org_status (org_id, status),
  KEY idx_org_lastseen (org_id, last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migrate existing bridges from agents table to bridges table
-- Identify bridges by ReportsEffectiveConfig capability
INSERT INTO bridges (org_id, bridge_uid, name, version, status, last_seen_at, labels_json, capabilities_json)
SELECT org_id, agent_uid, name, version, status, last_seen_at, labels_json, capabilities_json
FROM agents
WHERE JSON_EXTRACT(capabilities_json, '$.reports_effective_config') = true
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  version = VALUES(version),
  status = VALUES(status),
  last_seen_at = VALUES(last_seen_at),
  labels_json = VALUES(labels_json),
  capabilities_json = VALUES(capabilities_json);

-- Delete bridges from agents table (they should not be there)
DELETE FROM agents
WHERE JSON_EXTRACT(capabilities_json, '$.reports_effective_config') = true;

-- Add cleanup job: remove stale offline collectors older than 10 minutes
-- This will be run periodically by the cleanup worker

