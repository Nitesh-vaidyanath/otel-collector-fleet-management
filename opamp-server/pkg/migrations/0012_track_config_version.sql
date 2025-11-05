-- Track which config version is running on each agent
ALTER TABLE agents 
ADD COLUMN running_config_id BIGINT NULL AFTER current_config_hash,
ADD COLUMN running_config_version INT NULL AFTER running_config_id,
ADD INDEX idx_running_config (running_config_id);

-- Add comment explaining the relationship
ALTER TABLE agents 
MODIFY COLUMN running_config_id BIGINT NULL COMMENT 'ID of agent_configs record that is currently running on this agent (matches current_config_hash)';

