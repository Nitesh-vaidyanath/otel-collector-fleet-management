-- Extend existing agent_telemetry table with resource usage fields (if they do not already exist)

ALTER TABLE agent_telemetry
  ADD COLUMN IF NOT EXISTS cpu_percent DOUBLE NULL AFTER telemetry_data,
  ADD COLUMN IF NOT EXISTS memory_bytes BIGINT NULL AFTER cpu_percent,
  ADD COLUMN IF NOT EXISTS inbound_bandwidth_kbps DOUBLE NULL AFTER memory_bytes,
  ADD COLUMN IF NOT EXISTS outbound_bandwidth_kbps DOUBLE NULL AFTER inbound_bandwidth_kbps,
  ADD COLUMN IF NOT EXISTS pipelines_json JSON NULL AFTER outbound_bandwidth_kbps;

CREATE INDEX IF NOT EXISTS idx_agent_telemetry_org_time_usage
  ON agent_telemetry (org_id, agent_uid, reported_at);
