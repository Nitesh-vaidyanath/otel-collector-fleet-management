import { buildDefaultMetricQueries, PipelineMetricQueries, PipelineMetricKey } from '../../components/PipelineMetricsPanelView';
import { LOGS_QUERY_PLACEHOLDER } from '../constants';
import type { StageMetricTemplates, StageQueryPair, StageQueryKey, FleetTelemetrySettings, MetricsTelemetryConfig, LogsTelemetryConfig } from '../types';

export const buildDefaultStageQueries = (): StageMetricTemplates => ({
  receivers: {
    inbound: 'sum(rate(otelcol_receiver_accepted_log_records_total{service_instance_id="$collector_uid", pod=~"$pod", receiver="$stage", pipeline="$pipeline"}[5m]))',
    outbound: 'sum(rate(otelcol_receiver_failed_log_records_total{service_instance_id="$collector_uid", pod=~"$pod", receiver="$stage", pipeline="$pipeline"}[5m]))',
  },
  processors: {
    inbound: 'sum(rate(otelcol_processor_incoming_items_total{service_instance_id="$collector_uid", pod=~"$pod", pipeline="$pipeline", processor="$stage"}[5m]))',
    outbound: 'sum(rate(otelcol_processor_outgoing_items_total{service_instance_id="$collector_uid", pod=~"$pod", pipeline="$pipeline", processor="$stage"}[5m]))',
  },
  exporters: {
    inbound: 'sum(rate(otelcol_exporter_send_failed_log_records_total{service_instance_id="$collector_uid", pod=~"$pod", pipeline="$pipeline", exporter="$stage"}[5m])) + sum(rate(otelcol_exporter_sent_log_records_total{service_instance_id="$collector_uid", pod=~"$pod", pipeline="$pipeline", exporter="$stage"}[5m]))',
    outbound: 'sum(rate(otelcol_exporter_sent_log_records_total{service_instance_id="$collector_uid", pod=~"$pod", pipeline="$pipeline", exporter="$stage"}[5m]))',
  },
});

export const cloneStageQueries = (incoming?: Partial<Record<StageQueryKey, Partial<StageQueryPair>>> | null): StageMetricTemplates => {
  const defaults = buildDefaultStageQueries();
  const normalize = (key: StageQueryKey): StageQueryPair => {
    const candidate = (incoming && incoming[key]) || {};
    const inbound = typeof candidate.inbound === 'string' && candidate.inbound.trim() !== '' ? candidate.inbound : defaults[key].inbound;
    const outbound = typeof candidate.outbound === 'string' && candidate.outbound.trim() !== '' ? candidate.outbound : defaults[key].outbound;
    return { inbound, outbound };
  };
  return {
    receivers: normalize('receivers'),
    processors: normalize('processors'),
    exporters: normalize('exporters'),
  };
};

export const getDefaultTelemetrySettingsState = (): FleetTelemetrySettings => ({
  metrics: {
    enabled: false,
    datasourceUid: null,
    datasourceOrgId: null,
    queries: buildDefaultMetricQueries('$pipeline'),
    stageQueries: buildDefaultStageQueries(),
  },
  logs: {
    enabled: false,
    datasourceUid: null,
    datasourceOrgId: null,
    query: LOGS_QUERY_PLACEHOLDER,
  },
});

export const normalizeTelemetrySettingsState = (incoming: any): FleetTelemetrySettings => {
  const defaults = getDefaultTelemetrySettingsState();
  const parseOrgId = (value: any): number | null => {
    if (value === null || value === undefined) {
      return null;
    }
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  };
  if (!incoming || typeof incoming !== 'object') {
    return defaults;
  }

  const metrics: MetricsTelemetryConfig = {
    enabled: Boolean(incoming.metrics?.enabled),
    datasourceUid: typeof incoming.metrics?.datasourceUid === 'string' ? incoming.metrics.datasourceUid : (typeof incoming.metrics?.datasource_uid === 'string' ? incoming.metrics.datasource_uid : null),
    datasourceOrgId: parseOrgId(incoming.metrics?.datasourceOrgId ?? incoming.metrics?.datasource_org_id),
    queries: { ...defaults.metrics.queries },
    stageQueries: cloneStageQueries(incoming.metrics?.stageQueries || incoming.metrics?.stage_queries || null),
  };

  if (incoming.metrics?.queries && typeof incoming.metrics.queries === 'object') {
    Object.entries(incoming.metrics.queries).forEach(([key, value]) => {
      if (typeof value === 'string' && (key as PipelineMetricKey) && value.trim() !== '') {
        metrics.queries[key as PipelineMetricKey] = value;
      }
    });
  }

  const logs: LogsTelemetryConfig = {
    enabled: Boolean(incoming.logs?.enabled),
    datasourceUid: typeof incoming.logs?.datasourceUid === 'string' ? incoming.logs.datasourceUid : (typeof incoming.logs?.datasource_uid === 'string' ? incoming.logs.datasource_uid : null),
    datasourceOrgId: parseOrgId(incoming.logs?.datasourceOrgId ?? incoming.logs?.datasource_org_id),
    query: typeof incoming.logs?.query === 'string' && incoming.logs.query.trim() !== '' ? incoming.logs.query : LOGS_QUERY_PLACEHOLDER,
  };

  return {
    metrics,
    logs,
  };
};
