# Agent Classification via HTTP Headers

## Overview

The OpAMP server supports explicit agent classification using HTTP headers. This provides a reliable way to distinguish between different types of agents without relying on heuristics.

## Supported Agent Types

- `bridge` - OpAMP Bridge (operator-opamp-bridge)
- `agent` - Direct OpenTelemetry Collector agents (including CRDs with OpAMP Extension)
- `supervisor` - OpAMP Supervisor (opampsupervisor)

## Usage

### HTTP Header

Set the `X-OpAMP-Agent-Type` header when connecting to the OpAMP server:

```http
X-OpAMP-Agent-Type: bridge
```

**Valid values:**
- `bridge` - Identifies the connection as an OpAMP Bridge
- `agent` - Identifies the connection as a direct agent/collector
- `supervisor` - Identifies the connection as an OpAMP Supervisor

**Example:**
```bash
# Bridge connection
curl -H "X-OpAMP-Agent-Type: bridge" ws://localhost:4321/v1/opamp

# Direct agent connection
curl -H "X-OpAMP-Agent-Type: agent" ws://localhost:4321/v1/opamp

# Supervisor connection
curl -H "X-OpAMP-Agent-Type: supervisor" ws://localhost:4321/v1/opamp
```

## Classification Behavior

### Bridge (`X-OpAMP-Agent-Type: bridge`)
- Registered in the `bridges` table
- Can discover and manage collectors via EffectiveConfig
- Collectors discovered by bridges are stored with `bridge.instance_uid` label
- Appears in the "Bridges" section of the UI

### Agent (`X-OpAMP-Agent-Type: agent`)
- Registered in the `agents` table
- Includes:
  - Direct OpenTelemetry Collector CRDs with OpAMP Extension
  - Standalone collectors connecting directly
  - VM/Docker collectors
- Appears in the "Collectors" section of the UI
- Bridge-discovered collectors (those with `bridge.instance_uid`) are excluded from the main agents list

### Supervisor (`X-OpAMP-Agent-Type: supervisor`)
- Registered in the `agents` table with supervisor classification
- Manages collectors on VM/Docker environments
- Appears in the "Collectors" section of the UI with supervisor label

### Unclassified (No header or invalid value)
- Registered in the `agents` table with `classification.status = "unclassified"` label
- Occurs when:
  - No `X-OpAMP-Agent-Type` header is provided
  - Header value is invalid (not `bridge`, `agent`, or `supervisor`)
- Appears in a separate "Unclassified" section in the UI
- **WARNING**: These agents may not function correctly and should be configured with proper headers

## ⚠️ Important Warnings

1. **REQUIRED Header**: The `X-OpAMP-Agent-Type` header is **REQUIRED** for proper classification. 
   - **WARNING**: Agents without this header will be classified as "unclassified" and may not function correctly.
   - **WARNING**: Always set the header to ensure proper agent registration and management.

2. **Invalid Values**: If an invalid value is provided, the agent will be classified as "unclassified".
   - Valid values are: `bridge`, `agent`, `supervisor` (case-insensitive)
   - Any other value will result in "unclassified" status

3. **Case Insensitive**: Header values are case-insensitive (e.g., `Bridge`, `BRIDGE`, `bridge` all work).

## Important Notes

1. **Bridge-Discovered Collectors**: Collectors discovered by bridges (via EffectiveConfig) are automatically marked with `bridge.instance_uid` label and appear under their managing bridge in the UI, not in the standalone agents list.

2. **Unclassified Agents**: Agents that don't provide a valid `X-OpAMP-Agent-Type` header will be:
   - Registered in the `agents` table with `classification.status = "unclassified"` label
   - Appear in a separate "Unclassified" section in the UI
   - Logged with warnings to help identify configuration issues
   - May not receive proper configuration management or monitoring

## Future Support

Future versions may support:
- OpAMP NonIdentifyingAttributes (`agent.type` or `opamp.agent_type`)
- CustomMessage-based classification
- Automatic detection based on message patterns

For now, only HTTP header-based classification is supported.

