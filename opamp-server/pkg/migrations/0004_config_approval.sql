-- Add approval workflow fields to agent_configs
ALTER TABLE agent_configs 
  ADD COLUMN approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending' AFTER config_yaml,
  ADD COLUMN approved_by VARCHAR(128) AFTER approval_status,
  ADD COLUMN approved_at DATETIME AFTER approved_by,
  ADD COLUMN modified_by VARCHAR(128) AFTER checksum,
  ADD COLUMN modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER modified_by;

-- Create index for approval queries
CREATE INDEX idx_org_agent_approval ON agent_configs(org_id, agent_uid, approval_status);

-- Keep only last 5 versions per agent (trigger will be added via cleanup function)
-- For now, we'll handle this in application code

