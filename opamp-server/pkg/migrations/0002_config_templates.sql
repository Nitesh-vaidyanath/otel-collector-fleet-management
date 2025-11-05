CREATE TABLE IF NOT EXISTS config_templates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  org_id BIGINT NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  receivers_json JSON NOT NULL,
  processors_json JSON NOT NULL,
  exporters_json JSON NOT NULL,
  created_by VARCHAR(128),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_org_name (org_id, name),
  KEY idx_org_created (org_id, created_at)
);

