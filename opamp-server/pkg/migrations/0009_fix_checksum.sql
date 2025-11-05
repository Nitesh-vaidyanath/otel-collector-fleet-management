-- Fix checksum column size (SHA256 is always 64 hex chars)
ALTER TABLE agent_configs MODIFY COLUMN checksum CHAR(64) NOT NULL;
