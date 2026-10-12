# Authenticated deployment-to-OpAMP integration

The combined Grafana workflow uses Kubernetes identity to enroll a managed agent, then opens its existing application configuration by the server-owned agent UID. OpAMP configuration delivery does not grant operating-system privileges. Admin deployment/security actions still go through the Kubernetes adapter, organization/owner checks, and cluster admission.

## Runtime contract

Authenticated runtime profiles must declare `supportsOpampTokenFile: true`, use a verified `wss://` endpoint, and specify `opampTokenAudience` at the deployment configuration root. This is an explicit operator assertion about the image, not a feature automatically added to a stock Collector or MCP server. Implement the contract in the agent or supervisor before enabling it.

The managed pod keeps service-account token automount disabled. It mounts a dedicated projected token, with a 600-second requested lifetime and the configured audience, in a read-only volume. `OPAMP_AUTH_TOKEN_FILE` points to that file; neither environment variables, APIs nor logs contain the token body. Do not use a volume `subPath`: clients must see file rotation.

The reference in `opamp-server/examples/managed-client` rereads the file using opamp-go `HeaderFunc` on each WebSocket dial, removes a previous Authorization header on failure, uses ordinary WSS certificate verification, and rejects redirects. It reports synthetic health only. It does **not** inspect host processes, apply application configuration, restart a workload or grant capabilities. A real adapter must implement and advertise only the operations it genuinely supports.

Build and test the reference (no credentials needed for its tests):

```sh
cd opamp-server
go test ./examples/managed-client
go build ./examples/managed-client
```

Run it only in a prepared managed pod with `OPAMP_ENDPOINT` and `OPAMP_AUTH_TOKEN_FILE`. The server, token audience, Kubernetes RBAC, supported image and TLS trust must already be configured. This guide neither creates a cluster nor applies permissions.

## Backend authorization

The backend verifies Bearer authentication through Kubernetes TokenReview with the expected audience. It requires bound Pod identity and verifies exact UID ownership through Pod → controlling ReplicaSet → controlling Deployment. Namespace, service account, fleet organization, owner and deployment UID must match the durable enrollment record. Tenant/type headers and reported Kubernetes labels cannot select a managed identity. Wire InstanceUid is kept separate from the stable application UID so replies target the exact current session.

The `managed_agent_enrollments` table in the single baseline schema stores enrollment, not credential contents. Projected token authentication requires Kubernetes to return bound Pod identity in TokenReview; implementations without it fail closed. Deleted/replaced deployment identities and revoked enrollment cannot authenticate. Credentials should be sent over WSS; plaintext backend transport is permitted only through the explicit `OPAMP_TRUSTED_TLS_TERMINATION=true` operator setting behind a trusted TLS-terminating proxy. The server does not trust caller-supplied forwarding headers as proof of TLS.

`OPAMP_ALLOW_UNAUTHENTICATED_LEGACY=true` preserves old anonymous clients only when explicitly enabled. It is unsafe outside an isolated test network and does not establish managed identity. It is set only in the repository's disposable manual-test Compose setup. Remove it for authenticated deployments.

## Additional Kubernetes RBAC

These are examples for a platform operator to review and bind to the **backend** service account, not agent pods. They are not applied by Make targets. Namespace/resource names are placeholders:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: fleet-managed-agents
  namespace: agent-runtime
rules:
  - apiGroups: [apps]
    resources: [deployments]
    verbs: [get, list, create, patch, delete]
  - apiGroups: [apps]
    resources: [replicasets]
    verbs: [get]
  - apiGroups: [""]
    resources: [pods]
    verbs: [get]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: fleet-opamp-token-review
rules:
  - apiGroups: [authentication.k8s.io]
    resources: [tokenreviews]
    verbs: [create]
```

Pod reads expose pod specifications, potentially including plaintext environment settings; token verification is sensitive authorization. Neither requires reading Kubernetes Secrets or granting agent pods deployment-write rights. Admission policy remains necessary to constrain hostPID, hostNetwork, privileged mode, capabilities and Windows HostProcess. An elevated host-inspection agent can access more than its own data; authenticate it and restrict both its workload permissions and accepted configuration.

## Interpreting the combined UI

Enrollment, live OpAMP connection, desired/accepted security template and observed Pod profile are distinct states. A connected old Pod during rollout is not proof the replacement profile is running. `profileMatches` is based on the authenticated Pod's profile hash, not a client-reported label. Configuration acknowledgment is separate from effective-config reporting; a sent offer is not an acknowledgment. Open configuration targets only a verified server-owned agent UID and retains normal Grafana role enforcement.

Synthetic tests do not prove kubelet projection/rotation, cluster admission, real Windows execution or an arbitrary image's client implementation. See [architecture](FLEET_CONTROL_ARCHITECTURE.md) and [test report](AGENT_PRIVILEGE_TEST_REPORT.md) for current evidence and remaining deployment validation.

Sources: [Kubernetes service-account token validation](https://kubernetes.io/docs/reference/access-authn-authz/service-accounts-admin/), [OpAMP specification](https://opentelemetry.io/docs/specs/opamp/).
