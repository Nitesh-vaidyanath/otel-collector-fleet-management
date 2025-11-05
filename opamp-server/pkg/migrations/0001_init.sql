
CREATE TABLE IF NOT EXISTS agents (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  org_id BIGINT NOT NULL,
  agent_uid VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  version VARCHAR(64),
  status ENUM('online','offline','degraded') DEFAULT 'offline',
  last_seen_at DATETIME,
  labels_json JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_agentuid (org_id, agent_uid),
  KEY idx_org_status (org_id, status),
  KEY idx_org_lastseen (org_id, last_seen_at)
);

CREATE TABLE IF NOT EXISTS agent_configs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  org_id BIGINT NOT NULL,
  agent_uid VARCHAR(64),
  version INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  config_yaml MEDIUMTEXT NOT NULL,
  checksum CHAR(64) NOT NULL,
  created_by VARCHAR(128),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_org_agent (org_id, agent_uid),
  KEY idx_org_version (org_id, version)
);
