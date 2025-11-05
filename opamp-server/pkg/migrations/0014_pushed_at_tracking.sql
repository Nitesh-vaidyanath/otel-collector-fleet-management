-- Track when configurations were pushed to agents
ALTER TABLE agent_configs 
ADD COLUMN pushed_at DATETIME NULL AFTER approved_at,
ADD COLUMN pushed_by VARCHAR(255) NULL AFTER pushed_at;

-- Add index for querying pushed configs
CREATE INDEX idx_pushed_at ON agent_configs(pushed_at);

