-- Track RemoteConfigStatus and config drift detection
-- Stores desired vs effective config hashes for drift detection

-- Add columns to agents table for config status tracking
ALTER TABLE agents 
  ADD COLUMN desired_config_hash CHAR(64) NULL AFTER current_config_hash,
  ADD COLUMN effective_config_hash CHAR(64) NULL AFTER desired_config_hash,
  ADD COLUMN remote_config_status VARCHAR(50) NULL AFTER effective_config_hash,
  ADD COLUMN remote_config_error TEXT NULL AFTER remote_config_status,
  ADD COLUMN remote_config_status_at DATETIME NULL AFTER remote_config_error,
  ADD INDEX idx_config_status (remote_config_status, remote_config_status_at);

-- Config status values:
-- NULL = no status yet
-- 'RECEIVED' = agent received RemoteConfig
-- 'APPLIED' = agent applied RemoteConfig successfully
-- 'FAILED' = agent failed to apply RemoteConfig
-- 'UNSET' = agent has no remote config status

