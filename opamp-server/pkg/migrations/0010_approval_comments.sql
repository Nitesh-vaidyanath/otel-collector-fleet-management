-- Add approval comment field to agent_configs
ALTER TABLE agent_configs 
  ADD COLUMN approval_comment TEXT AFTER approved_at;

