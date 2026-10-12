# Synthetic OpAMP end-to-end fixture

This fixture runs a real OpAMP WebSocket client built with the repository's pinned `opamp-go v0.22.0`. It connects to the embedded OpAMP listener in the isolated Grafana test container. It sends only synthetic identity, health, and a tiny synthetic effective config. The client container attaches only to `fleet_manual_test_network`; it has no published ports and the manual test network is internal.

## Start and run

From the repository root, start the existing disposable manual stack if it is not already running:

```sh
docker compose -f tests/manual/compose.yaml up -d
```

Build the fixture and run one direct-agent identity:

```sh
docker compose -f tests/manual/opamp-e2e/compose.yaml build
docker compose -f tests/manual/opamp-e2e/compose.yaml run --rm agent
```

Run a separate synthetic bridge-classified identity:

```sh
AGENT_TYPE=bridge docker compose -f tests/manual/opamp-e2e/compose.yaml run --rm agent
```

Each invocation exits nonzero on a failed WebSocket handshake, OpAMP server error, or failure to report effective config. The default fixture waits 20 seconds for the server to offer a pending remote config, then prints whether that behavior was exercised. The direct agent and synthetic bridge use distinct UIDs. To shorten/lengthen the wait, set `DURATION=30s` (or another Go duration).

## What the fixture exercises

The direct-agent wire `InstanceUid` is the exact 16 byte ASCII sequence `e2e-agent-000001`, hex `6532652d6167656e742d303030303031`. The bridge identity uses `e2e-bridge-00001`, hex `6532652d6272696467652d3030303031`. The raw response probe uses a separate reserved synthetic UID, `e2e-probe-000001`, hex `6532652d70726f62652d303030303031`; it fails if the server unexpectedly offers config to that UID. The opamp-go client sends the selected agent or bridge UID in the WebSocket protocol. Each client sets `X-OpAMP-Agent-Type` to `agent` or `bridge`, sends a description with only synthetic attributes, reports a healthy status, and reports a tiny `synthetic.yaml` effective config. If a pending remote config exists for the agent or bridge UID, the fixture accepts it only when every config file contains the `e2e.fixture: opamp-e2e` marker, updates its in-memory effective config, then replies with `RemoteConfigStatus=APPLIED` and the exact offered hash. It never logs config bodies or applies a config to a real workload.

The fixture first performs a raw OpAMP WebSocket exchange using the separate probe UID to decode and assert the actual ServerToAgent `InstanceUid` echo and server capability bits, then connects with the opamp-go client and sends status/effective config. The observed server capability bits are `0x07`: `AcceptsStatus`, `OffersRemoteConfig`, and `AcceptsEffectiveConfig`. The client capability bits observed by the backend are `6151` (`ReportsStatus`, `AcceptsRemoteConfig`, `ReportsEffectiveConfig`, `ReportsHealth`, `ReportsRemoteConfigStatus`, and `ReportsHeartbeat`). Restart is an application command, not an OpAMP server capability bit; this fixture does not request or execute restart. It also does not mutate a real collector or Kubernetes workload.

## Captured evidence

Run against the rebuilt disposable Grafana backend on 2026-10-12:

| Identity | Wire UID (hex) | Wire result | Backend inventory |
| --- | --- | --- | --- |
| Direct agent | `e2e-agent-000001` (`6532652d6167656e742d303030303031`) | opamp-go handshake connected; AgentToServer capability bits `6151`; effective config hash persisted | `agents` API returned the same UID, `status=online`, synthetic labels, and reported capabilities while connected. `config-sync-status` returned `hasConfig=true`, a current config hash, and `lastStatusReport`. |
| Bridge-classified identity | `e2e-bridge-00001` (`6532652d6272696467652d3030303031`) | opamp-go handshake connected; AgentToServer capability bits `6151`; effective config sent | `bridges` API returned the same UID with `status=online`, synthetic labels, reported capabilities, and `collectors=[]`. |

The separate response probe `e2e-probe-000001` (`6532652d70726f62652d303030303031`) received `ServerToAgent.capabilities=0x07` and an exact UID echo for both runs. It appears as an additional short-lived synthetic agent row and is offline after the probe closes.

Both client runs exited `0` with `remote_config=not_offered`; there was no pending config for either synthetic UID. Restart was not sent. The health-history API returned an empty result; its handler currently reads the third URL segment as the UID even though the route is `/agents/{uid}/health`, so that API result cannot establish health persistence. API responses were checked from inside the disposable Grafana container; no browser or cluster was used. The direct resource API returned the expected inventory, but Grafana logs also showed the plugin-proxy route failing DNS lookup for `fleet-backend` because this manual compose file has no such service. A rendered UI state was not inspected and is not claimed as working in this topology.

To inspect backend evidence:

```sh
docker compose -f tests/manual/compose.yaml logs --since=5m grafana
```

Look for `OPAMP agent connected`, the synthetic UID (or its normalized hex form), a message with health/effective config, and the server capability response. The plugin's agents API/UI should show the direct synthetic agent as online after its first message; the bridge-classified identity is stored through bridge registration paths. The fixture doesn't automate UI access. Use the existing local Grafana API/UI separately if needed; no browser is required for the protocol test.

## Remote config and restart limits

The code can acknowledge a remote config offer, but the automatic fixture does not create a pending config. The server only offers one after an authorized, approved config push has created a pending row for the exact synthetic UID. Config approval and push are application workflows and depend on the manual Grafana setup; they are intentionally not automated here. If a pending row is already present, the fixture acknowledges it and reports its hash. Otherwise, output says `remote_config=not_offered`; this is not evidence of a ServerToAgent config offer.

Restart is intentionally untested. The backend's restart operation invokes deployment/runtime behavior beyond the OpAMP handshake, and proving restart safely needs a disposable synthetic supervisor or test workload wired into the command handler. Do not direct this fixture at a production OpAMP endpoint.

## Architecture

```text
synthetic opamp-go client container
        │ WebSocket /v1/opamp, InstanceUid + AgentToServer
        ▼
internal Docker network: fleet_manual_test_network
        ▼
Grafana container: plugin backend's embedded OpAMP listener (:4321)
        ├── ServerToAgent capability response / optional RemoteConfig offer
        ├── OpAMP handler: identity, health, effective config, remote-config status
        ├── MySQL: agent/bridge inventory and telemetry state
        └── Grafana plugin API/UI: observable inventory and status
```

The Grafana plugin frontend is not in the protocol path. It reads inventory and status through the plugin backend APIs, while agents connect directly to the embedded OpAMP WebSocket listener. A bridge is an OpAMP client identity that can report and manage discovered collector identities; the fixture only exercises bridge classification and connection, not a live Kubernetes discovery loop.
