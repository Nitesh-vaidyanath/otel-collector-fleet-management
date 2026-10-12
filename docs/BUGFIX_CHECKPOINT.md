# Bug-fix batch checkpoint

This first local batch addresses agent label snapshots, OpAMP remote-config
status decisions, telemetry datasource selection, stale drawer requests, and
PromQL suggestions. It is not an end-to-end deployment or fleet validation.

Backend registration now distinguishes a real `AgentDescription` from a
classification-only heartbeat. The three production UPSERT statements share a
presence gate: absent descriptions preserve persisted labels, while a real
description replaces the full snapshot, including removals. Remote-config
states use canonical values; only valid `APPLIED` reports with a nonempty hash
and no error update the confirmed hash. That accepted state is stored as the
private `APPLIED_CONFIRMED` marker in the existing status column so pruning
telemetry can restore the last confirmed hash without treating a newer failed,
pending, malformed, or hashless report as applied. Hashless `APPLIED` reports
store the fixed diagnostic `APPLIED report missing configuration hash`.
Outward status remains `APPLIED`. The three status read paths reject telemetry
query failures and skip ordinary health records. The current-config endpoint
compares against the latest approved checksum even when the current config
matches an older approved version. Config comparison keeps its diff based on
the reported effective config, not merely the last offered hash. Existing
unmarked `APPLIED` rows are ambiguous and
therefore cannot restore a confirmed hash after their telemetry expires; a
subsequent valid applied report establishes the marker.

Agent and bridge label snapshots are no longer unioned in a cross-request UI
cache. Telemetry settings retain `null` for “Current org”; the drawer resolves
that to the current org only when building datasource requests. Separate
request epochs fence stale datasource and Prometheus metadata responses across
org/datasource changes and close/reopen. PromQL helpers conservatively update a
single identifiable metric or insert a matcher inside its selector; unsupported
or compound expressions remain unchanged with a hint. The AMD transform is now
importable for tests and still runs as a build script when invoked directly.

Safe tests live in the backend package and use `httptest.NewRecorder`, fake SQL
execution/query boundaries, and a synthetic browser page. The old
`tests/unit/approval_test.go` is retained behind the `legacy_mysql_integration`
build tag because it writes to a local MySQL database; it was not run. Default
`make test` runs isolated Go and frontend tests only. `make test-e2e` remains an
explicit opt-in and was not run.

## Verification results

| Check | Result |
| --- | --- |
| `make test` | PASS: backend race tests; 11/11 frontend helper, bundle, AMD, and browser tests |
| `cd opamp-server && go vet ./...` | PASS |
| `go test -tags standalone -run '^$' ./pkg/backend/...` | PASS: compile only, no tests executed |
| `go test -tags loopback -run '^$' ./pkg/backend/...` | PASS: compile only, no tests executed |
| `git diff --check` | PASS |

The browser test mounts the actual drawer through the production AMD transform
with local React and mocked Grafana APIs. It covers org races, stale metadata,
close/reopen errors, and page errors. All network requests are blocked. Cached
Chromium is required; macOS sandbox launch failed, then the scoped approved
run outside the sandbox passed. No dependencies were installed.

## Remaining limits

This is a first bug-fix batch, not a claim that all bugs are fixed. Real MySQL
UPSERT behavior, a full Grafana installation, collector/bridge wire integration,
and live fleet behavior remain untested. The discovered-collector Kubernetes
health label path is separate from the three registration UPSERTs and remains
outside this batch. PromQL helpers support conservative single-selector forms,
not every valid PromQL expression. This is not a complete security audit.

No MySQL, Grafana, cluster, VM, or deployed service was contacted or changed.
Laptop secrets, credentials, process environments/memory, and real application
payloads were not inspected. Raw config and attribute previews were removed
from the affected OpAMP debug/push logging paths.
