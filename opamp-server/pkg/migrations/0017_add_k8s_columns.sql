-- Add explicit Kubernetes identity columns to agents table
-- This enables fast queries for collectors by namespace/name without parsing JSON
-- Also supports multi-cluster scenarios with cluster_id

ALTER TABLE agents
  ADD COLUMN k8s_namespace VARCHAR(255) NULL AFTER labels_json,
  ADD COLUMN k8s_crd_name  VARCHAR(255) NULL AFTER k8s_namespace,
  ADD COLUMN cluster_id    VARCHAR(255) NULL AFTER k8s_crd_name;

-- Create indexes for fast lookups
CREATE INDEX idx_agents_ns_name ON agents (k8s_namespace, k8s_crd_name);
CREATE INDEX idx_agents_cluster_ns_name ON agents (cluster_id, k8s_namespace, k8s_crd_name);

-- Update existing rows to populate these columns from labels_json
UPDATE agents
SET k8s_namespace = JSON_UNQUOTE(JSON_EXTRACT(labels_json, '$."k8s.namespace"')),
    k8s_crd_name = JSON_UNQUOTE(JSON_EXTRACT(labels_json, '$."k8s.crd_name"'))
WHERE labels_json IS NOT NULL
  AND (JSON_EXTRACT(labels_json, '$."k8s.namespace"') IS NOT NULL
    OR JSON_EXTRACT(labels_json, '$."k8s.crd_name"') IS NOT NULL);

