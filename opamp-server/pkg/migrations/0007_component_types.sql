-- Component Types Management
-- Stores receiver, processor, and exporter type definitions with their default configs

CREATE TABLE IF NOT EXISTS component_types (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT 1,
  component_category ENUM('receiver', 'processor', 'exporter') NOT NULL,
  type_name VARCHAR(255) NOT NULL,
  display_label VARCHAR(255) NOT NULL,
  default_config_json TEXT,
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE, -- System types cannot be deleted
  is_custom BOOLEAN DEFAULT FALSE, -- Custom types can be fully edited
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_by VARCHAR(255),
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_type_per_org (org_id, component_category, type_name),
  INDEX idx_category (component_category),
  INDEX idx_org_category (org_id, component_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert default system types for receivers
INSERT INTO component_types (org_id, component_category, type_name, display_label, default_config_json, description, is_system, created_by) VALUES
(1, 'receiver', 'otlp', 'OTLP', '{"protocols":{"grpc":{"endpoint":"0.0.0.0:4317"},"http":{"endpoint":"0.0.0.0:4318"}}}', 'OpenTelemetry Protocol receiver for traces, metrics, and logs', TRUE, 'system'),
(1, 'receiver', 'prometheus', 'Prometheus', '{"config":{"scrape_configs":[]}}', 'Prometheus receiver for metrics', TRUE, 'system'),
(1, 'receiver', 'jaeger', 'Jaeger', '{"protocols":{"grpc":{"endpoint":"0.0.0.0:14250"},"http":{"endpoint":"0.0.0.0:14268"}}}', 'Jaeger receiver for traces', TRUE, 'system'),
(1, 'receiver', 'zipkin', 'Zipkin', '{"endpoint":"0.0.0.0:9411"}', 'Zipkin receiver for traces', TRUE, 'system'),
(1, 'receiver', 'hostmetrics', 'Host Metrics', '{"scrapers":{"cpu":{},"disk":{},"load":{},"memory":{},"network":{}}}', 'Host metrics receiver', TRUE, 'system'),
(1, 'receiver', 'filelog', 'File Log', '{"include":[],"exclude":[]}', 'File log receiver', TRUE, 'system'),
(1, 'receiver', 'syslog', 'Syslog', '{"tcp":{"listen_address":"0.0.0.0:514"}}', 'Syslog receiver', TRUE, 'system');

-- Insert default system types for processors
INSERT INTO component_types (org_id, component_category, type_name, display_label, default_config_json, description, is_system, created_by) VALUES
(1, 'processor', 'batch', 'Batch', '{"send_batch_size":1024,"timeout":"10s","send_batch_max_size":2048}', 'Batch processor for batching telemetry data', TRUE, 'system'),
(1, 'processor', 'memory_limiter', 'Memory Limiter', '{"limit_mib":512,"spike_limit_mib":128,"check_interval":"1s"}', 'Memory limiter processor', TRUE, 'system'),
(1, 'processor', 'attributes', 'Attributes', '{"actions":[]}', 'Attribute processor for modifying attributes', TRUE, 'system'),
(1, 'processor', 'resource', 'Resource', '{"attributes":[]}', 'Resource processor for modifying resource attributes', TRUE, 'system'),
(1, 'processor', 'filter', 'Filter', '{"spans":{},"metrics":{},"logs":{}}', 'Filter processor for filtering telemetry', TRUE, 'system'),
(1, 'processor', 'probabilistic_sampler', 'Probabilistic Sampler', '{"sampling_percentage":10}', 'Probabilistic sampler processor', TRUE, 'system');

-- Insert default system types for exporters
INSERT INTO component_types (org_id, component_category, type_name, display_label, default_config_json, description, is_system, created_by) VALUES
(1, 'exporter', 'otlp', 'OTLP', '{"endpoint":"http://localhost:4317","tls":{"insecure":true}}', 'OpenTelemetry Protocol exporter', TRUE, 'system'),
(1, 'exporter', 'logging', 'Logging', '{"loglevel":"info"}', 'Logging exporter for debugging', TRUE, 'system'),
(1, 'exporter', 'prometheus', 'Prometheus', '{"endpoint":"0.0.0.0:8889"}', 'Prometheus exporter', TRUE, 'system'),
(1, 'exporter', 'jaeger', 'Jaeger', '{"endpoint":"localhost:14250","tls":{"insecure":true}}', 'Jaeger exporter for traces', TRUE, 'system'),
(1, 'exporter', 'zipkin', 'Zipkin', '{"endpoint":"http://localhost:9411/api/v2/spans"}', 'Zipkin exporter for traces', TRUE, 'system'),
(1, 'exporter', 'influxdb', 'InfluxDB', '{"endpoint":"http://localhost:8086","bucket":"","org":"","token":""}', 'InfluxDB exporter for metrics', TRUE, 'system'),
(1, 'exporter', 'elasticsearch', 'Elasticsearch', '{"endpoints":[],"index":"logs"}', 'Elasticsearch exporter for logs', TRUE, 'system');

