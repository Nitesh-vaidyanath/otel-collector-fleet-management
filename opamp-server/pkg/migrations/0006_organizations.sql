-- Create organizations/tenants table
CREATE TABLE IF NOT EXISTS organizations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_name (name)
);

-- Add organization name column to agents for easier display
ALTER TABLE agents ADD COLUMN org_name VARCHAR(128) AFTER org_id;

-- Insert default organization if it doesn't exist
INSERT IGNORE INTO organizations (id, name, description) VALUES (1, 'Default Organization', 'Default organization for agents');

-- Update existing agents to have org_name
UPDATE agents SET org_name = 'Default Organization' WHERE org_id = 1 AND org_name IS NULL;

