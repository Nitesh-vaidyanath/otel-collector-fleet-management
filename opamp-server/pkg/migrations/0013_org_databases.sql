-- Multi-tenant database support
-- Note: For separate databases per org_id, you would need to create separate databases
-- This migration ensures all tables support org_id filtering

-- Ensure all tables have org_id indexed properly
CREATE INDEX IF NOT EXISTS idx_agents_org_uid ON agents(org_id, agent_uid);
CREATE INDEX IF NOT EXISTS idx_configs_org_agent ON agent_configs(org_id, agent_uid, version);
CREATE INDEX IF NOT EXISTS idx_activity_org_agent ON agent_activity_log(org_id, agent_uid);
CREATE INDEX IF NOT EXISTS idx_telemetry_org_agent ON agent_telemetry(org_id, agent_uid, telemetry_type);
CREATE INDEX IF NOT EXISTS idx_queue_org_agent ON pending_config_queue(org_id, agent_uid);

-- For separate databases per org, you would:
-- 1. Create database: grafana_agents_org_1, grafana_agents_org_2, etc.
-- 2. Run all migrations on each database
-- 3. Configure backend to use different DSN per org_id
-- 4. This is complex - current single DB with org_id filtering is simpler

