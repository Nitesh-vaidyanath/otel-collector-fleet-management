-- Shared-schema organization scoping. This project uses one database and filters
-- rows by org_id; it does not create a database per Grafana organization.

-- Ensure all tables have org_id indexed properly
CREATE INDEX IF NOT EXISTS idx_agents_org_uid ON agents(org_id, agent_uid);
CREATE INDEX IF NOT EXISTS idx_configs_org_agent ON agent_configs(org_id, agent_uid, version);
CREATE INDEX IF NOT EXISTS idx_activity_org_agent ON agent_activity_log(org_id, agent_uid);
CREATE INDEX IF NOT EXISTS idx_telemetry_org_agent ON agent_telemetry(org_id, agent_uid, telemetry_type);
CREATE INDEX IF NOT EXISTS idx_queue_org_agent ON pending_config_queue(org_id, agent_uid);

