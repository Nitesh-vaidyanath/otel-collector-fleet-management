-- Migration: Add pending config queue for async delivery
-- This allows configs to be queued and sent when agents reconnect

CREATE TABLE IF NOT EXISTS pending_config_queue (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    org_id BIGINT NOT NULL,
    agent_uid VARCHAR(255) NOT NULL,
    config_id BIGINT NULL,  -- Reference to agent_configs.id (nullable for raw configs)
    config_yaml MEDIUMTEXT NOT NULL,
    config_hash CHAR(64) NOT NULL,  -- SHA256 hash (64 hex chars)
    queued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME NULL,  -- NULL until sent
    attempts INT NOT NULL DEFAULT 0,  -- Number of send attempts
    last_attempt_at DATETIME NULL,
    last_error TEXT NULL,
    created_by VARCHAR(255),
    org_name VARCHAR(255),  -- For consistency with other tables
    UNIQUE KEY uq_agent_pending (org_id, agent_uid),  -- One pending config per agent
    INDEX idx_org_agent (org_id, agent_uid),
    INDEX idx_sent_at (sent_at),
    FOREIGN KEY (config_id) REFERENCES agent_configs(id) ON DELETE CASCADE
);

