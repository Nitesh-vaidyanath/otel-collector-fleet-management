# Combined agent management: privilege test report

Source verification, October 12, 2026. Synthetic Grafana identities, in-memory adapters and captured Kubernetes HTTP requests only. No browser, laptop secrets, real cluster, privileged workload or host process data was accessed. These results verify authorization and requested templates, not effective runtime privileges.

| Operation | Viewer | Editor | Admin | Verified result |
| --- | --- | --- | --- | --- |
| Read application config and managed deployments | Allowed | Allowed | Allowed | Organization-scoped handlers |
| Generate application-only config | Denied | Allowed | Allowed | Editor can still generate pipelines |
| Export deployment CRD through config generator | Denied | 403 | Allowed as text | No Kubernetes operation implied |
| Create / start / stop / restart / delete deployment | 403 | 403 | Allowed for owned target | Operator allowlist and ownership checks |
| Select permitted security profile | 403 | 403 | Allowed for owned target | UID + resourceVersion required; stale requests rejected |
| Inject raw host flags, privileged, capabilities or pod spec | 403 | 403 | 400 | Cannot bypass operator-approved profiles |

**What now works:** One app has OpAMP application configuration plus Kubernetes deployment/security controls. A platform operator defines permitted runtime/security profiles; Grafana Admin selects among them. Tests cover Linux hostPID/hostNetwork, capability and privileged profile rendering, and Windows HostProcess templates. The restricted default drops all capabilities, disallows privilege escalation, runs non-root and uses a read-only root filesystem. Cross-OS selections and inconsistent definitions are rejected. Security updates preserve the node, runtime, service account and replicas; stopped deployments stay stopped. Active rollouts report `Updating` until Kubernetes status catches up.

**What OpAMP alone cannot do:** Standard OpAMP does not grant Kubernetes RBAC or Linux capabilities. In this design, the backend service account needs namespaced `get/list/create/patch/delete` on `apps/deployments`; ordinary agents need no such management rights. Grafana Admin does not override cluster admission. Agent RoleBindings, arbitrary pod specs, host-path mounts, arbitrary existing workloads and generic agent config schemas are not managed by these controls.

**Safety:** Host namespaces reduce isolation; SYS_PTRACE permits sensitive process inspection when other controls allow it; SYS_ADMIN, privileged Linux and Windows HostProcess substantially broaden host access. Elevated profiles should be exceptional. Deployment-write RBAC is itself sensitive and requires independent admission policy. Raw fields are rejected, mutations check ownership/concurrency, deployment management is disabled without explicit configuration, and agent pods should never reuse the backend management service account. See [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/) and [Windows HostProcess](https://kubernetes.io/docs/tasks/configure-pod-container/create-hostprocess-pod/).

**Managed OpAMP implementation:** Deployment-to-OpAMP association is now implemented with audience-bound TokenReview authentication, Pod → ReplicaSet → Deployment UID verification, durable enrollment, replacement-pod ownership checks, and current security-profile-hash checks. Managed config offers/acks are identity-scoped. `go test -race ./pkg/backend/... ./examples/managed-client/...` and `go vet ./pkg/backend/... ./examples/managed-client/...` pass using synthetic/in-memory adapters. This is not yet a real WebSocket session test of the authenticated path; it does not establish projected token rotation, live Kubernetes RBAC/admission or an actual config offer/ack. The legacy OpAMP fixture results in [OPAMP_E2E.md](OPAMP_E2E.md) are anonymous synthetic-protocol tests and must not be conflated with managed enrollment.

**Remaining verification:** Live cluster admission/runtime behavior, Windows execution, authenticated WSS handshake and an approved remote-config offer/ack/restart sequence remain unverified. The UI labels any unassociated OpAMP state **Not verified**. These are release gaps, not successful results.

Verification commands (no browser or cluster required):

```sh
make test-agent-privileges
make test-safe
```

See [architecture](FLEET_CONTROL_ARCHITECTURE.md), [deployment setup](AGENT_DEPLOYMENTS.md), and [OpAMP evidence](OPAMP_E2E.md). Test sources in `opamp-server/pkg/backend`: `agent_security_profiles_test.go`, `agent_privilege_boundary_test.go`, `agent_permissions_test.go`, `agent_deployments_test.go`.
