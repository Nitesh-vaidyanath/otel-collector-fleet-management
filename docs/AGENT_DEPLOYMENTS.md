# Combined agent deployment and configuration management

The Grafana app combines OpAMP application configuration with Kubernetes deployment controls. OpAMP delivers application configuration/status; the plugin backend calls Kubernetes for desired deployment changes. See [architecture and role matrix](FLEET_CONTROL_ARCHITECTURE.md).

Deployment management is disabled unless the backend receives a valid `AGENT_DEPLOYMENT_CONFIG` JSON allowlist. An unset value returns `enabled: false` without initializing a Kubernetes client. Viewer reads; Editor generates/saves/reverts application config and pushes the exact Admin-approved configuration; Admin approves configuration and manages owned deployments/security profiles. Deployment CRD generation also requires Admin. Backend checks enforce these rules independently of UI buttons.

## Operator configuration

Illustrative allowlist only; it is not applied to a cluster and supplies no agent bootstrap config:

```json
{
  "namespace": "agent-runtime",
  "permittedNodes": ["worker-a", "worker-b"],
  "permittedServiceAccounts": ["agent-runtime"],
  "securityProfiles": {
    "process-observer": {
      "os": "linux",
      "summary": "Host process visibility and ptrace; no SYS_ADMIN",
      "hostPID": true,
      "capabilitiesAdd": ["SYS_PTRACE"],
      "runAsNonRoot": false,
      "allowPrivilegeEscalation": false,
      "readOnlyRootFilesystem": true
    }
  },
  "profiles": {
    "otel-collector": {
      "image": "registry.example/otelcol:0.120.0",
      "serviceAccount": "agent-runtime",
      "os": "linux",
      "command": ["/otelcol"],
      "args": ["--config=/etc/otelcol/config.yaml"],
      "opampEndpoint": "wss://opamp.example.net/v1/opamp",
      "securityProfiles": ["restricted", "process-observer"],
      "defaultSecurityProfile": "restricted"
    }
  }
}
```

This example does not make a Collector inspect processes or implement OpAMP. Use an image with the required agent/client or supervisor and bootstrap config. A capability in a template does not prove any particular inspection operation succeeds.

The reserved Linux `restricted` profile is supplied automatically and cannot be redefined to elevate access. Omitting a Linux runtime's profile list retains that default. Linux profiles may explicitly select hostPID/hostNetwork/hostIPC, privileged mode, capabilities, non-root execution, privilege escalation and read-only root filesystem. Privileged or SYS_ADMIN profiles must explicitly permit privilege escalation. Capability names use Kubernetes form, e.g. `SYS_ADMIN`, without `CAP_`. Arbitrary pod YAML and host-path mounts are not accepted.

Windows runtime profiles require `os: "windows"` and their own Windows security-profile list/default. A Windows profile requesting `hostProcess: true` must also set `hostNetwork: true` and `runAsUserName`. Linux fields are rejected for Windows and vice versa. A Windows image and supported Windows node/runtime are separately required; no live Windows execution was tested.

Each runtime can select only its listed profiles with matching OS. The platform operator defines this allowlist, not API callers. Profile selection represents desired policy, not attestation of runtime privileges. The UI shows accepted template security separately from rollout status.

## Kubernetes authority

The backend uses only the in-cluster Kubernetes service, projected service-account token and cluster CA; no host kubeconfig fallback. It needs namespaced `get/list/create/patch/delete` on `apps/deployments`. The adapter needs no Secrets access, Nodes listing, pod exec or RoleBinding mutation. Agent pods should use a different, least-privilege service account; token automount remains disabled.

Admission policy must independently constrain permitted pod settings. Deployment-write RBAC does not restrict individual security fields. Pod Security Admission may reject an elevated profile despite Grafana authorization. Grafana Admin is not Kubernetes cluster-admin.

The app creates one-replica `Recreate` Deployments in the allowed namespace, with required node affinity on selected `metadata.name` and an OS selector. It does not adopt arbitrary Pods/DaemonSets. Pods receive `OPAMP_ENDPOINT`; this URL is not a credential. The API creates neither ConfigMaps nor Secrets.

## API

Backend paths are routed through the Grafana plugin resource adapter:

- `GET /plugin-api/agent-deployments`: enabled state, runtime profiles (with `permittedSecurityProfiles`), security profiles, nodes and owned organization-scoped deployments.
- `POST /plugin-api/agent-deployments`: `{"profile":"otel-collector","node":"worker-a","securityProfile":"restricted"}`. Omitting securityProfile uses the runtime default.
- `POST /plugin-api/agent-deployments/{fleetId}/security-profile`: `{"securityProfile":"process-observer","uid":"<current UID>","resourceVersion":"<current version>"}`. Admin only; unknown fields rejected.
- `POST /plugin-api/agent-deployments/{fleetId}/start`, `/stop`, `/restart`: absent body or `{}` only.
- `DELETE /plugin-api/agent-deployments/{fleetId}`: absent body or `{}` only.

Stable fleet ID, Kubernetes UID and OpAMP UID are distinct. Mutations check organization and owner; security updates additionally reject stale UID/resourceVersion. Updates preserve image, arguments, service account, node and replicas. Active deployments roll out; zero replicas stay zero. `Updating` indicates desired and observed state have not converged, not that running agents already have the new privileges.

Authenticated deployment-to-OpAMP association is implemented through the projected-token enrollment and Kubernetes UID chain described in [Managed OpAMP Enrollment](MANAGED_OPAMP_ENROLLMENT.md). The automated tests use synthetic Kubernetes/TokenReview adapters; live WSS and cluster admission remain unverified. Unassociated OpAMP state remains **Not verified**. The Collector-specific builder does not yet provide generic AI/MCP schemas. See [the privilege report](AGENT_PRIVILEGE_TEST_REPORT.md) for tested boundaries and release gaps.
