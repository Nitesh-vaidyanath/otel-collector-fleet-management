# Data model and architecture

The authoritative MySQL table definitions, foreign keys, indexes and entity
relationship graph are maintained in [MySQL Schema](MYSQL_SCHEMA.md). That
document describes the single shared MySQL database and the `org_id` tenant
boundary. Grafana's internal database is separate and is not merged with the
fleet application database.

For workload deployment choices and the division between OpAMP and Kubernetes
permissions, see [Agent Deployment Models](AGENT_DEPLOYMENT_MODELS.md). For the
integrated control-plane picture and current verification boundary, see
[Control Planes and Drift Watch](CONTROL_PLANES_AND_DRIFTWATCH.md).

The app is unreleased. Its only SQL initializer is
`opamp-server/pkg/migrations/0001_initial_schema.sql`; it creates a fresh schema
and is not an in-place upgrade. The backend does not run DDL at startup. The
local runner refuses any target database that already contains tables.
