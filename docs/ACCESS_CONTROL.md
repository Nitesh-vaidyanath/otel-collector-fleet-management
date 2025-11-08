# Plugin Access Control Setup

Grafana Enterprise Access Control can block plugin requests if users do not have the `plugins.app:access` permission for this app. Use the steps below to provision roles with the right scopes.

## Provision roles (recommended)

Create a provisioning file such as `provisioning/access-control/fleet-plugin.yaml`:

```
apiVersion: 1
roles:
  - name: fleet-plugin-viewer
    description: Read-only access to OTel Collector Fleet Management plugin
    permissions:
      - action: plugins.app:access
        scope: plugins:id:otel-collector-agent-fleet-management
    members:
      - builtinRole: Viewer

  - name: fleet-plugin-editor
    description: Config management access for OTel Collector Fleet Management plugin
    permissions:
      - action: plugins.app:access
        scope: plugins:id:otel-collector-agent-fleet-management
    members:
      - builtinRole: Editor
```

Mount the file at `/etc/grafana/provisioning/access-control/` (or include it in your ConfigMap) and restart Grafana. You should see logs confirming the roles were created.

## Manage via Grafana UI

1. Navigate to **Administration → Users & Access → Roles**.
2. Create (or edit) a role.
3. Add permission `plugins.app:access` with scope `plugins:id:otel-collector-agent-fleet-management`.
4. Assign the role to the desired users or teams (e.g., Viewer group for read-only, Editor/Admin for config changes).

## Troubleshooting

- If Grafana logs contain `No permissions set ... action:plugins.app:access`, the user does not have the permission and requests will continue to return 401.
- After roles are provisioned, `logger=accesscontrol.evaluator` entries should show `Matched scope` for the plugin ID.
- Use `kubectl logs deployment/grafana` (or check Grafana’s UI) to verify the plugin requests return HTTP 200 once permissions are applied.

## Multi-tenant headers and labels

The backend now accepts optional tenancy overrides so you can scope requests without rebuilding the plugin:

| Signal | Description |
|--------|-------------|
| `X-Scoper-Org-Id` / `X-Scoper-OrgID` | Force all REST calls in the request to run as the given numeric org ID. Takes precedence over the Grafana `X-Grafana-Org-Id` header. |
| `X-Scoper-Tenant` | Supply a tenant/org **name**. The backend looks it up in the `organizations` table and uses the matching ID. |
| `org_id`, `organization.id`, `tenant.id` (agent/bridge labels) | Existing numeric labels for OpAMP agents. |
| `tenant.name`, `organization.name`, `tenant` (agent/bridge labels) | New string labels; the backend resolves the org ID by name when agents connect. |

If a tenant name does not exist, the backend falls back to org `1`. Make sure the organizations you expect are created (via the UI or API) so name lookups succeed.
