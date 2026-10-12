-- Bind Grafana tenants to fleet organizations only after an operator verifies
-- the relationship. Existing organizations intentionally remain unmapped.
ALTER TABLE organizations
  ADD COLUMN grafana_org_id BIGINT NULL,
  ADD UNIQUE KEY uq_organizations_grafana_org_id (grafana_org_id);
