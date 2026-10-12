CREATE TABLE IF NOT EXISTS managed_agent_enrollments (
    fleet_id VARCHAR(64) NOT NULL PRIMARY KEY,
    deployment_uid VARCHAR(128) NOT NULL,
    namespace VARCHAR(63) NOT NULL,
    deployment_name VARCHAR(253) NOT NULL,
    org_id BIGINT NOT NULL,
    owner_login VARCHAR(255) NOT NULL,
    service_account VARCHAR(253) NOT NULL,
    agent_uid VARCHAR(96) NOT NULL UNIQUE,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    pod_uid VARCHAR(128) NULL,
    effective_config_hash VARCHAR(128) NULL,
    remote_config_status VARCHAR(64) NULL,
    last_seen TIMESTAMP(6) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_managed_enrollments_org_owner (org_id, owner_login),
    INDEX idx_managed_enrollments_deployment_uid (deployment_uid)
);
