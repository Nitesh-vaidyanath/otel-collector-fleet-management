-- Agent Telemetry Storage
-- Stores metrics, logs, traces, health, and pipeline statuses reported by agents via OpAMP

CREATE TABLE IF NOT EXISTS agent_telemetry (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id BIGINT NOT NULL,
  agent_uid VARCHAR(255) NOT NULL,
  telemetry_type ENUM('metrics', 'logs', 'traces', 'health', 'pipeline_status') NOT NULL,
  telemetry_data JSON NOT NULL,
  reported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (org_id, agent_uid, reported_at),
  INDEX (org_id, agent_uid, telemetry_type, reported_at),
  INDEX (reported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Agent Health History
CREATE TABLE IF NOT EXISTS agent_health_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id BIGINT NOT NULL,
  agent_uid VARCHAR(255) NOT NULL,
  healthy BOOLEAN,
  last_error TEXT,
  status_message TEXT,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (org_id, agent_uid, recorded_at),
  INDEX (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pipeline Status Storage
CREATE TABLE IF NOT EXISTS agent_pipeline_status (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id BIGINT NOT NULL,
  agent_uid VARCHAR(255) NOT NULL,
  pipeline_name VARCHAR(255) NOT NULL,
  pipeline_type ENUM('traces', 'metrics', 'logs') NOT NULL,
  status ENUM('healthy', 'degraded', 'stopped', 'unknown') DEFAULT 'unknown',
  error_message TEXT,
  last_updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_pipeline (org_id, agent_uid, pipeline_name),
  INDEX (org_id, agent_uid, status),
  INDEX (last_updated)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

