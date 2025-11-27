import { PipelineMetricQueries } from '../components/PipelineMetricsPanelView';

// Telemetry types
export type StageQueryPair = {
  inbound: string;
  outbound: string;
};

export type StageQueryKey = 'receivers' | 'processors' | 'exporters';

export type StageMetricTemplates = {
  receivers: StageQueryPair;
  processors: StageQueryPair;
  exporters: StageQueryPair;
};

export type MetricsTelemetryConfig = {
  enabled: boolean;
  datasourceUid: string | null;
  datasourceOrgId?: number | null;
  queries: PipelineMetricQueries;
  stageQueries: StageMetricTemplates;
};

export type LogsTelemetryConfig = {
  enabled: boolean;
  datasourceUid: string | null;
  datasourceOrgId?: number | null;
  query: string;
};

export type FleetTelemetrySettings = {
  metrics: MetricsTelemetryConfig;
  logs: LogsTelemetryConfig;
};

// Runtime types
export type RuntimeMode = 'grafana' | 'standalone';
export type GrafanaTransport = 'proxy' | 'resources';

// Agent types
export interface Agent {
  id: number;
  orgId: number;
  agentUid: string;
  name: string;
  version?: string;
  status: string;
  lastSeen?: string;
  labels?: Record<string, string>;
  capabilities?: Record<string, any>;
}

export interface Collector extends Agent {}

export interface Bridge {
  id: number;
  orgId: number;
  agentUid: string;
  name: string;
  version?: string;
  status: string;
  lastSeen?: string;
  labels?: Record<string, string>;
  capabilities?: Record<string, any>;
  cluster?: string;
  namespace?: string;
  collectors: Collector[];
}

// UI types
export type Tab = 'collectors' | 'configurations' | 'monitoring';

// Capability types
export type CapabilityDescriptor = {
  label: string;
  description: string;
  icon: string;
  tone: { bg: string; border: string; color: string };
};

// Component types
export type ComponentCategory = 'receiver' | 'processor' | 'exporter';

// API types
export type FetchOptions = Record<string, any>;

export type OpampSettingsResponse = {
  opampServerURL?: string | null;
  opampEndpoint?: string | null;
};
