-- Add current_config to agents table to store agent's active configuration
ALTER TABLE agents ADD COLUMN current_config_yaml MEDIUMTEXT AFTER capabilities_json;
ALTER TABLE agents ADD COLUMN current_config_hash CHAR(64) AFTER current_config_yaml;

-- Create activity log table to track configuration pushes and other actions
CREATE TABLE IF NOT EXISTS agent_activity_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  org_id BIGINT NOT NULL,
  agent_uid VARCHAR(64) NOT NULL,
  activity_type ENUM('config_push', 'config_approve', 'config_reject', 'config_revert', 'upgrade', 'agent_register', 'agent_disconnect') NOT NULL,
  description TEXT,
  config_id BIGINT NULL,
  config_version INT NULL,
  performed_by VARCHAR(128),
  performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata JSON,
  KEY idx_org_agent (org_id, agent_uid),
  KEY idx_org_type (org_id, activity_type),
  KEY idx_performed_at (performed_at),
  FOREIGN KEY (config_id) REFERENCES agent_configs(id) ON DELETE SET NULL
);

