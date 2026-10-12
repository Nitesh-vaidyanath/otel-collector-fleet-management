-- Drift Watch Fleet Management: fresh-install baseline schema (MySQL 8).
-- One database is shared by all Grafana organizations; org_id scopes tenant rows.
-- This file is for a new database. Never replay it as an in-place upgrade.

CREATE TABLE IF NOT EXISTS organizations (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  grafana_org_id BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_organizations_name (name),
  UNIQUE KEY uq_organizations_grafana_org_id (grafana_org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO organizations (id, name, description)
VALUES (1, 'Default Organization', 'Default organization for agents');

CREATE TABLE IF NOT EXISTS agents (
  id BIGINT NOT NULL AUTO_INCREMENT,
  org_id BIGINT NOT NULL,
  org_name VARCHAR(128) NULL,
  agent_uid VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  version VARCHAR(64) NULL,
  status ENUM('online','offline','degraded','unclassified') NOT NULL DEFAULT 'offline',
  last_seen_at DATETIME NULL,
  labels_json JSON NULL,
  capabilities_json JSON NULL,
  k8s_namespace VARCHAR(255) NULL,
  k8s_crd_name VARCHAR(255) NULL,
  cluster_id VARCHAR(255) NULL,
  current_config_yaml MEDIUMTEXT NULL,
  current_config_hash CHAR(64) NULL,
  running_config_id BIGINT NULL COMMENT 'Config record currently reported by this agent',
  running_config_version INT NULL,
  desired_config_hash CHAR(64) NULL,
  effective_config_hash CHAR(64) NULL,
  remote_config_status VARCHAR(50) NULL,
  remote_config_error TEXT NULL,
  remote_config_status_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_agentuid (org_id, agent_uid),
  KEY idx_agents_org_status (org_id, status),
  KEY idx_agents_org_lastseen (org_id, last_seen_at),
  KEY idx_agents_ns_name (k8s_namespace, k8s_crd_name),
  KEY idx_agents_cluster_ns_name (cluster_id, k8s_namespace, k8s_crd_name),
  KEY idx_running_config (running_config_id),
  KEY idx_config_status (remote_config_status, remote_config_status_at),
  CONSTRAINT fk_agents_org FOREIGN KEY (org_id) REFERENCES organizations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_configs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  org_id BIGINT NOT NULL,
  agent_uid VARCHAR(64) NULL,
  version INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  config_yaml MEDIUMTEXT NOT NULL,
  approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approved_by VARCHAR(128) NULL,
  approved_at DATETIME NULL,
  approval_comment TEXT NULL,
  pushed_at DATETIME NULL,
  pushed_by VARCHAR(255) NULL,
  checksum CHAR(64) NOT NULL,
  modified_by VARCHAR(128) NULL,
  modified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_configs_org_agent_version (org_id, agent_uid, version),
  KEY idx_configs_org_version (org_id, version),
  KEY idx_configs_org_agent_approval (org_id, agent_uid, approval_status),
  KEY idx_configs_pushed_at (pushed_at),
  CONSTRAINT fk_agent_configs_org FOREIGN KEY (org_id) REFERENCES organizations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS config_templates (
  id BIGINT NOT NULL AUTO_INCREMENT,
  org_id BIGINT NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  receivers_json JSON NOT NULL,
  processors_json JSON NOT NULL,
  exporters_json JSON NOT NULL,
  created_by VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_templates_org_name (org_id, name),
  KEY idx_templates_org_created (org_id, created_at),
  CONSTRAINT fk_config_templates_org FOREIGN KEY (org_id) REFERENCES organizations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_activity_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  org_id BIGINT NOT NULL,
  agent_uid VARCHAR(64) NOT NULL,
  activity_type ENUM('config_push','config_approve','config_reject','config_revert','upgrade','agent_register','agent_disconnect') NOT NULL,
  description TEXT NULL,
  config_id BIGINT NULL,
  config_version INT NULL,
  performed_by VARCHAR(128) NULL,
  performed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSON NULL,
  PRIMARY KEY (id),
  KEY idx_activity_org_agent (org_id, agent_uid),
  KEY idx_activity_org_type (org_id, activity_type),
  KEY idx_activity_performed_at (performed_at),
  CONSTRAINT fk_activity_org FOREIGN KEY (org_id) REFERENCES organizations (id),
  CONSTRAINT fk_activity_config FOREIGN KEY (config_id) REFERENCES agent_configs (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS component_types (
  id BIGINT NOT NULL AUTO_INCREMENT,
  org_id BIGINT NOT NULL DEFAULT 1,
  component_category ENUM('receiver','processor','exporter') NOT NULL,
  type_name VARCHAR(255) NOT NULL,
  display_label VARCHAR(255) NOT NULL,
  default_config_json TEXT NULL,
  description TEXT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_custom BOOLEAN NOT NULL DEFAULT FALSE,
  created_by VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modified_by VARCHAR(255) NULL,
  modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_component_type_org (org_id, component_category, type_name),
  KEY idx_component_category (component_category),
  KEY idx_component_org_category (org_id, component_category),
  CONSTRAINT fk_component_types_org FOREIGN KEY (org_id) REFERENCES organizations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO component_types
  (org_id, component_category, type_name, display_label, default_config_json, description, is_system, created_by)
VALUES
  (1,'receiver','otlp','OTLP','{"protocols":{"grpc":{"endpoint":"0.0.0.0:4317"},"http":{"endpoint":"0.0.0.0:4318"}}}','OpenTelemetry Protocol receiver',TRUE,'system'),
  (1,'receiver','prometheus','Prometheus','{"config":{"scrape_configs":[]}}','Prometheus receiver for metrics',TRUE,'system'),
  (1,'receiver','jaeger','Jaeger','{"protocols":{"grpc":{"endpoint":"0.0.0.0:14250"},"http":{"endpoint":"0.0.0.0:14268"}}}','Jaeger receiver for traces',TRUE,'system'),
  (1,'receiver','zipkin','Zipkin','{"endpoint":"0.0.0.0:9411"}','Zipkin receiver for traces',TRUE,'system'),
  (1,'receiver','hostmetrics','Host Metrics','{"scrapers":{"cpu":{},"disk":{},"load":{},"memory":{},"network":{}}}','Host metrics receiver',TRUE,'system'),
  (1,'receiver','filelog','File Log','{"include":[],"exclude":[]}','File log receiver',TRUE,'system'),
  (1,'receiver','syslog','Syslog','{"tcp":{"listen_address":"0.0.0.0:514"}}','Syslog receiver',TRUE,'system'),
  (1,'processor','batch','Batch','{"send_batch_size":1024,"timeout":"10s","send_batch_max_size":2048}','Batch processor',TRUE,'system'),
  (1,'processor','memory_limiter','Memory Limiter','{"limit_mib":512,"spike_limit_mib":128,"check_interval":"1s"}','Memory limiter processor',TRUE,'system'),
  (1,'processor','attributes','Attributes','{"actions":[]}','Attribute processor',TRUE,'system'),
  (1,'processor','resource','Resource','{"attributes":[]}','Resource processor',TRUE,'system'),
  (1,'processor','filter','Filter','{"spans":{},"metrics":{},"logs":{}}','Filter processor',TRUE,'system'),
  (1,'processor','probabilistic_sampler','Probabilistic Sampler','{"sampling_percentage":10}','Probabilistic sampler',TRUE,'system'),
  (1,'exporter','otlp','OTLP','{"endpoint":"http://localhost:4317","tls":{"insecure":true}}','OpenTelemetry Protocol exporter',TRUE,'system'),
  (1,'exporter','logging','Logging','{"loglevel":"info"}','Logging exporter',TRUE,'system'),
  (1,'exporter','prometheus','Prometheus','{"endpoint":"0.0.0.0:8889"}','Prometheus exporter',TRUE,'system'),
  (1,'exporter','jaeger','Jaeger','{"endpoint":"localhost:14250","tls":{"insecure":true}}','Jaeger exporter',TRUE,'system'),
  (1,'exporter','zipkin','Zipkin','{"endpoint":"http://localhost:9411/api/v2/spans"}','Zipkin exporter',TRUE,'system'),
  (1,'exporter','influxdb','InfluxDB','{"endpoint":"http://localhost:8086","bucket":"","org":"","token":""}','InfluxDB exporter',TRUE,'system'),
  (1,'exporter','elasticsearch','Elasticsearch','{"endpoints":[],"index":"logs"}','Elasticsearch exporter',TRUE,'system');

CREATE TABLE IF NOT EXISTS agent_telemetry (
  id BIGINT NOT NULL AUTO_INCREMENT,
  org_id BIGINT NOT NULL,
  agent_uid VARCHAR(255) NOT NULL,
  telemetry_type ENUM('metrics','logs','traces','health','pipeline_status','remote_config_status') NOT NULL,
  telemetry_data JSON NOT NULL,
  cpu_percent DOUBLE NULL,
  memory_bytes BIGINT NULL,
  inbound_bandwidth_kbps DOUBLE NULL,
  outbound_bandwidth_kbps DOUBLE NULL,
  pipelines_json JSON NULL,
  reported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_telemetry_org_agent_time (org_id, agent_uid, reported_at),
  KEY idx_telemetry_org_agent_type_time (org_id, agent_uid, telemetry_type, reported_at),
  KEY idx_telemetry_reported_at (reported_at),
  CONSTRAINT fk_agent_telemetry_org FOREIGN KEY (org_id) REFERENCES organizations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_health_history (
  id BIGINT NOT NULL AUTO_INCREMENT,
  org_id BIGINT NOT NULL,
  agent_uid VARCHAR(255) NOT NULL,
  healthy BOOLEAN NULL,
  last_error TEXT NULL,
  status_message TEXT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_health_org_agent_time (org_id, agent_uid, recorded_at),
  KEY idx_health_recorded_at (recorded_at),
  CONSTRAINT fk_agent_health_org FOREIGN KEY (org_id) REFERENCES organizations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_pipeline_status (
  id BIGINT NOT NULL AUTO_INCREMENT,
  org_id BIGINT NOT NULL,
  agent_uid VARCHAR(255) NOT NULL,
  pipeline_name VARCHAR(255) NOT NULL,
  pipeline_type ENUM('traces','metrics','logs') NOT NULL,
  status ENUM('healthy','degraded','stopped','unknown') NOT NULL DEFAULT 'unknown',
  error_message TEXT NULL,
  last_updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agent_pipeline (org_id, agent_uid, pipeline_name),
  KEY idx_pipeline_org_agent_status (org_id, agent_uid, status),
  KEY idx_pipeline_last_updated (last_updated),
  CONSTRAINT fk_agent_pipeline_org FOREIGN KEY (org_id) REFERENCES organizations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS telemetry_settings (
  org_id BIGINT NOT NULL,
  settings_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id),
  CONSTRAINT fk_telemetry_settings_org FOREIGN KEY (org_id) REFERENCES organizations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pending_config_queue (
  id BIGINT NOT NULL AUTO_INCREMENT,
  org_id BIGINT NOT NULL,
  agent_uid VARCHAR(255) NOT NULL,
  config_id BIGINT NULL,
  config_yaml MEDIUMTEXT NOT NULL,
  config_hash CHAR(64) NOT NULL,
  queued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_attempt_at DATETIME NULL,
  last_error TEXT NULL,
  created_by VARCHAR(255) NULL,
  org_name VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agent_pending (org_id, agent_uid),
  KEY idx_pending_sent_at (sent_at),
  CONSTRAINT fk_pending_config_org FOREIGN KEY (org_id) REFERENCES organizations (id),
  CONSTRAINT fk_pending_config_record FOREIGN KEY (config_id) REFERENCES agent_configs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bridges (
  id BIGINT NOT NULL AUTO_INCREMENT,
  org_id BIGINT NOT NULL,
  bridge_uid VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  version VARCHAR(64) NULL,
  status ENUM('online','offline','degraded') NOT NULL DEFAULT 'offline',
  last_seen_at DATETIME NULL,
  labels_json JSON NULL,
  capabilities_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_bridgeuid (org_id, bridge_uid),
  KEY idx_bridges_org_status (org_id, status),
  KEY idx_bridges_org_lastseen (org_id, last_seen_at),
  CONSTRAINT fk_bridges_org FOREIGN KEY (org_id) REFERENCES organizations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS managed_agent_enrollments (
  fleet_id VARCHAR(64) NOT NULL,
  deployment_uid VARCHAR(128) NOT NULL,
  namespace VARCHAR(63) NOT NULL,
  deployment_name VARCHAR(253) NOT NULL,
  org_id BIGINT NOT NULL,
  owner_login VARCHAR(255) NOT NULL,
  service_account VARCHAR(253) NOT NULL,
  agent_uid VARCHAR(96) NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  pod_uid VARCHAR(128) NULL,
  effective_config_hash VARCHAR(128) NULL,
  remote_config_status VARCHAR(64) NULL,
  last_seen TIMESTAMP(6) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (fleet_id),
  UNIQUE KEY uq_managed_agent_uid (agent_uid),
  KEY idx_managed_org_owner (org_id, owner_login),
  KEY idx_managed_deployment_uid (deployment_uid),
  CONSTRAINT fk_managed_enrollments_org FOREIGN KEY (org_id) REFERENCES organizations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
