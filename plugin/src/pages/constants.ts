// Plugin constants and configuration

export const PLUGIN_ID = 'otel-collector-agent-fleet-management';
export const RESOURCE_ROOT = `/api/plugins/${PLUGIN_ID}/resources`;
export const RESOURCE_PREFIX = `${RESOURCE_ROOT}/plugin-api`;
export const PROXY_PREFIX = `/api/plugin-proxy/${PLUGIN_ID}/plugin-api`;
export const STANDALONE_PREFIX = '/plugin-api';

export const DEFAULT_OPAMP_WS = 'ws://localhost:4321/v1/opamp';
export const TELEMETRY_SETTINGS_ENDPOINT = 'telemetry-settings';
export const LOGS_QUERY_PLACEHOLDER = `{service_instance_id="$collector_uid"}`;
export const SUPPORTED_LOKI_TYPES = new Set(['loki']);

export const GRAFANA_CORE_ENDPOINTS = ['/api/datasources', '/api/frontend', '/api/search', '/api/ruler'];

export const STAGE_KEYS = ['receivers', 'processors', 'exporters'] as const;

export const capabilityOrder = [
  'accepts_remote_config',
  'reports_effective_config',
  'reports_health',
  'reports_own_logs',
  'reports_own_metrics',
  'reports_own_traces',
  'accepts_restart_command',
  'reports_remote_config',
  'reports_status',
  'reports_available_components',
];

