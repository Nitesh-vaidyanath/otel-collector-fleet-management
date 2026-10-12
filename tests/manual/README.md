# Isolated manual test stack

`make manual-test-up` starts only `tests/manual/compose.yaml` (Grafana on
`127.0.0.1:3001` plus its own MySQL schema and named volumes). It does not touch
the root Compose stack or a Kubernetes cluster. The MySQL volume is preserved
by `make manual-test-down`; do not use `docker compose down -v` unless you
intentionally want to erase this fixture's Grafana/MySQL test state.

Before the first start, `tests/manual/generate-init.cjs` emits
`tests/manual/generated/init.sql` from the historical application migrations.
That SQL is initialized only when the isolated MySQL volume is empty. It is a
single-schema fixture, not a production schema merger or a safe in-place
upgrade. Current deployments also use one MySQL database for all organizations,
scoped by `org_id`; Grafana's own internal database is separate and must not be
merged into the application schema.

The isolated stack opts into anonymous legacy OpAMP solely for the synthetic
protocol fixture. Authenticated deployment identity is tested with fake
TokenReview/Kubernetes adapters in `make test-managed-opamp`. Neither test
grants a real workload capabilities or contacts a cluster.
