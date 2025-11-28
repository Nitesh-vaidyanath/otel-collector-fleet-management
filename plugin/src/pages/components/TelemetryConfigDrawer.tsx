import React from 'react';
// Using plain textarea for PromQL input to avoid runtime issues with embedded editors
import type { MetricsTelemetryConfig, LogsTelemetryConfig, StageQueryKey, StageQueryPair } from '../types';
import { PipelineMetricKey } from '../../components/PipelineMetricsPanelView';
import { STAGE_KEYS } from '../constants';
import { buildDefaultStageQueries } from '../utils/telemetry';
import { createBackendSrv } from '../utils/api';
import { detectRuntimeMode, detectGrafanaTransport } from '../utils/runtime';

const PROM_DATASOURCE_TYPES = new Set(['prometheus', 'mimir', 'grafana-mimir-datasource', 'thanos']);
const LOKI_DATASOURCE_TYPES = new Set(['loki']);

const STAGE_SUMMARY: Record<StageQueryKey, { title: string }> = {
  receivers: { title: 'Receivers' },
  processors: { title: 'Processors' },
  exporters: { title: 'Exporters' },
};

const STAGE_QUERY_HINTS: Record<StageQueryKey, string> = {
  receivers: 'Defaults use otelcol_receiver_accepted_log_records_total and otelcol_receiver_failed_log_records_total filtered by $stage and $pipeline.',
  processors: 'Defaults rely on otelcol_processor_incoming_items_total and otelcol_processor_outgoing_items_total per processor.',
  exporters: 'Defaults combine otelcol_exporter_sent_log_records_total with otelcol_exporter_send_failed_log_records_total for each exporter.',
};

const runtimeMode = detectRuntimeMode();
const isRunningInGrafana = runtimeMode === 'grafana';
const grafanaTransport = detectGrafanaTransport(isRunningInGrafana);
const backendSrv = createBackendSrv(isRunningInGrafana, grafanaTransport);

const { useState, useEffect } = React;

export type TelemetryConfigDrawerProps = {
  open: boolean;
  mode: 'metrics' | 'logs';
  metricsConfig: MetricsTelemetryConfig;
  logsConfig: LogsTelemetryConfig;
  currentOrgId: number | null;
  orgOptions: Array<{ id: number; name: string }>;
  onMetricsChange: (next: MetricsTelemetryConfig) => void;
  onLogsChange: (next: LogsTelemetryConfig) => void;
  onSave: (mode: 'metrics' | 'logs') => void;
  onClose: () => void;
  saving: boolean;
  canSave: boolean;
};

export const TelemetryConfigDrawer: React.FC<TelemetryConfigDrawerProps> = ({
  open,
  mode,
  metricsConfig,
  logsConfig,
  currentOrgId,
  orgOptions,
  onMetricsChange,
  onLogsChange,
  onSave,
  onClose,
  saving,
  canSave,
}) => {
  const [datasources, setDatasources] = useState<Array<{ id: number; uid: string; name: string; type: string }>>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveMetricsOrgId = metricsConfig.datasourceOrgId ?? currentOrgId ?? null;
  const effectiveLogsOrgId = logsConfig.datasourceOrgId ?? currentOrgId ?? null;
  const [metricNames, setMetricNames] = useState<string[]>([]);
  const [labelKeys, setLabelKeys] = useState<string[]>([]);
  const parseOrgId = (value: string): number | null => {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }
    const num = Number(trimmed);
    return Number.isFinite(num) && num > 0 ? num : null;
  };

  const handleStageQueryChange = (key: StageQueryKey, field: keyof StageQueryPair, value: string) => {
    onMetricsChange({
      ...metricsConfig,
      stageQueries: {
        ...metricsConfig.stageQueries,
        [key]: {
          ...metricsConfig.stageQueries[key],
          [field]: value,
        },
      },
    });
  };

  const handleStageReset = (key: StageQueryKey) => {
    const defaults = buildDefaultStageQueries();
    onMetricsChange({
      ...metricsConfig,
      stageQueries: {
        ...metricsConfig.stageQueries,
        [key]: {
          ...defaults[key],
        },
      },
    });
  };

  const loadDatasources = useCallback(async () => {
    if (!open) {
      setDatasources([]);
      setError(null);
      return;
    }
    const orgId = mode === 'metrics' ? effectiveMetricsOrgId : effectiveLogsOrgId;
    const headers = orgId ? { 'X-Grafana-Org-Id': String(orgId) } : undefined;
    let cancelled = false;
    const loadDatasources = async () => {
      setLoading(true);
      try {
        const response = await backendSrv.get<Array<{ id: number; uid: string; name: string; type: string }>>('/api/datasources', { headers });
        if (cancelled) {
          return;
        }
        const filtered = Array.isArray(response)
          ? response.filter((ds) => (mode === 'metrics' ? PROM_DATASOURCE_TYPES.has(ds.type) : LOKI_DATASOURCE_TYPES.has(ds.type)))
          : [];
        setDatasources(filtered);
        setError(filtered.length === 0 ? 'No compatible data sources were found.' : null);
      } catch (err: any) {
        if (!cancelled) {
          console.error('Failed to load data sources', err);
          setError(err?.message || 'Failed to load data sources.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    loadDatasources();
    return () => {
      cancelled = true;
    };
  }, [open, mode, metricsConfig.datasourceOrgId, logsConfig.datasourceOrgId]);

  useEffect(() => {
    loadDatasources();
  }, [loadDatasources]);

  const loadPromMetadata = useCallback(
    async (dsUid: string | null, orgId: number | null) => {
      if (!dsUid) {
        setMetricNames([]);
        setLabelKeys([]);
        return;
      }
      try {
        const ds = datasources.find((d) => d.uid === dsUid);
        if (!ds) {
          setMetricNames([]);
          setLabelKeys([]);
          return;
        }
        const headers = orgId ? { 'X-Grafana-Org-Id': String(orgId) } : undefined;
        const metricResp = await backendSrv.get<{ data?: string[]; status?: string }>(
          `/api/datasources/proxy/${ds.id}/api/v1/label/__name__/values`,
          { headers }
        );
        const labelsResp = await backendSrv.get<{ data?: string[]; status?: string }>(
          `/api/datasources/proxy/${ds.id}/api/v1/labels`,
          { headers }
        );
        setMetricNames(Array.isArray(metricResp?.data) ? metricResp.data : []);
        setLabelKeys(Array.isArray(labelsResp?.data) ? labelsResp.data : []);
      } catch {
        setMetricNames([]);
        setLabelKeys([]);
      }
    },
    [datasources]
  );

  useEffect(() => {
    if (mode === 'metrics') {
      loadPromMetadata(metricsConfig.datasourceUid, effectiveMetricsOrgId);
    }
  }, [mode, metricsConfig.datasourceUid, effectiveMetricsOrgId, loadPromMetadata]);

  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        background: 'rgba(15,23,42,0.45)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 420,
          maxWidth: '100%',
          height: '100%',
          background: '#FFFFFF',
          boxShadow: '-12px 0 24px rgba(15,23,42,0.2)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: 16, borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{mode === 'metrics' ? 'Configure metrics overlay' : 'Configure log snapshots'}</div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
            aria-label="Close telemetry configuration"
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {mode === 'metrics' ? (
            <>
              <div style={{ fontSize: 12, color: '#475569' }}>
                Select a Prometheus/Mimir datasource and adjust the default queries to match your labels. Placeholders like <code>$collector_uid</code>, <code>$pipeline</code>, and <code>$stage</code> are substituted at runtime.
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#1F2937' }}>
                Datasource org
                <select
                  value={effectiveMetricsOrgId ?? ''}
                  onChange={(event) =>
                    onMetricsChange({
                      ...metricsConfig,
                      datasourceOrgId: parseOrgId(event.target.value),
                      datasourceUid: null, // reset selection when org changes
                    })
                  }
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #CBD5F5', fontSize: 12 }}
                >
                  <option value="">Current org{currentOrgId ? ` (#${currentOrgId})` : ''}</option>
                  {orgOptions
                    .filter((o) => o.id !== currentOrgId)
                    .map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name || `Org ${org.id}`} (#{org.id})
                      </option>
                    ))}
                </select>
                <span style={{ fontSize: 11, color: '#6B7280' }}>
                  Pick another Grafana org to discover datasources there (requires access).
                </span>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#1F2937' }}>
                Data source
                <select
                  value={metricsConfig.datasourceUid ?? ''}
                  onChange={(event) =>
                    onMetricsChange({
                      ...metricsConfig,
                      datasourceUid: event.target.value || null,
                    })
                  }
                  disabled={loading || datasources.length === 0}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #CBD5F5', fontSize: 12 }}
                >
                  <option value="">Select datasource</option>
                  {datasources.map((ds) => (
                    <option key={ds.uid} value={ds.uid}>
                      {ds.name} ({ds.type})
                    </option>
                  ))}
                </select>
              </label>
              {(Object.keys(metricsConfig.queries) as PipelineMetricKey[]).map((key) => (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#1F2937' }}>
                  <div>{key.toUpperCase()} query</div>
                  <textarea
                    value={metricsConfig.queries[key]}
                    rows={5}
                    onChange={(event) =>
                      onMetricsChange({
                        ...metricsConfig,
                        queries: { ...metricsConfig.queries, [key]: event.target.value },
                      })
                    }
                    style={{ borderRadius: 6, border: '1px solid #CBD5F5', fontFamily: 'monospace', fontSize: 12, padding: 8 }}
                  />
                  {mode === 'metrics' && metricNames.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11, color: '#475569' }}>
                      {metricNames.slice(0, 12).map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() =>
                            onMetricsChange({
                              ...metricsConfig,
                              queries: { ...metricsConfig.queries, [key]: metricsConfig.queries[key] + ` ${name}` },
                            })
                          }
                          style={{
                            border: '1px solid #CBD5F5',
                            borderRadius: 4,
                            padding: '2px 6px',
                            background: '#F8FAFC',
                            cursor: 'pointer',
                          }}
                        >
                          {name}
                        </button>
                      ))}
                      {labelKeys.slice(0, 8).map((lbl) => (
                        <button
                          key={lbl}
                          type="button"
                          onClick={() =>
                            onMetricsChange({
                              ...metricsConfig,
                              queries: { ...metricsConfig.queries, [key]: metricsConfig.queries[key] + ` ${lbl}=\\\"\\\"` },
                            })
                          }
                          style={{
                            border: '1px solid #E5E7EB',
                            borderRadius: 4,
                            padding: '2px 6px',
                            background: '#FFFFFF',
                            cursor: 'pointer',
                          }}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginTop: 4 }}>Per-stage throughput templates</div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                These queries power the inbound/outbound chips for each receiver, processor, and exporter. Use placeholders such as <code>$collector_uid</code>, <code>$pipeline</code>, and <code>$stage</code> to interpolate the active component names.
              </div>
              {STAGE_KEYS.map((key) => (
                <div key={`stage-query-${key}`} style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{STAGE_SUMMARY[key].title}</div>
                    <button
                      type="button"
                      onClick={() => handleStageReset(key)}
                      style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #CBD5F5', background: '#FFFFFF', fontSize: 11, cursor: 'pointer' }}
                    >
                      Reset to defaults
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>{STAGE_QUERY_HINTS[key]}</div>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#1F2937' }}>
                    Inbound query
                    <textarea
                      value={metricsConfig.stageQueries[key].inbound}
                      rows={4}
                      onChange={(event) => handleStageQueryChange(key, 'inbound', event.target.value)}
                      style={{ borderRadius: 6, border: '1px solid #CBD5F5', fontFamily: 'monospace', fontSize: 12, padding: 8 }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#1F2937' }}>
                    Outbound query
                    <textarea
                      value={metricsConfig.stageQueries[key].outbound}
                      rows={4}
                      onChange={(event) => handleStageQueryChange(key, 'outbound', event.target.value)}
                      style={{ borderRadius: 6, border: '1px solid #CBD5F5', fontFamily: 'monospace', fontSize: 12, padding: 8 }}
                    />
                  </label>
                </div>
              ))}
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#475569' }}>
                Provide a Loki query template and adjust its labels to your environment. Supported placeholders: <code>$collector_uid</code>, <code>$collector_name</code>, <code>$org_name</code>.
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#1F2937' }}>
                Datasource org
                <select
                  value={effectiveLogsOrgId ?? ''}
                  onChange={(event) =>
                    onLogsChange({
                      ...logsConfig,
                      datasourceOrgId: parseOrgId(event.target.value),
                      datasourceUid: null, // reset selection when org changes
                    })
                  }
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #CBD5F5', fontSize: 12 }}
                >
                  <option value="">Current org{currentOrgId ? ` (#${currentOrgId})` : ''}</option>
                  {orgOptions
                    .filter((o) => o.id !== currentOrgId)
                    .map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name || `Org ${org.id}`} (#{org.id})
                      </option>
                    ))}
                </select>
                <span style={{ fontSize: 11, color: '#6B7280' }}>
                  Set this when the Loki datasource you need lives in another Grafana org.
                </span>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#1F2937' }}>
                Loki data source
                <select
                  value={logsConfig.datasourceUid ?? ''}
                  onChange={(event) =>
                    onLogsChange({
                      ...logsConfig,
                      datasourceUid: event.target.value || null,
                    })
                  }
                  disabled={loading || datasources.length === 0}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #CBD5F5', fontSize: 12 }}
                >
                  <option value="">Select datasource</option>
                  {datasources.map((ds) => (
                    <option key={ds.uid} value={ds.uid}>
                      {ds.name} ({ds.type})
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#1F2937' }}>
                Loki query template
                <textarea
                  value={logsConfig.query}
                  rows={6}
                  onChange={(event) => onLogsChange({ ...logsConfig, query: event.target.value })}
                  style={{ borderRadius: 6, border: '1px solid #CBD5F5', fontFamily: 'monospace', fontSize: 12, padding: 8 }}
                />
              </label>
            </>
          )}
          {error && (
            <div style={{ padding: 10, borderRadius: 6, border: '1px solid #FECACA', background: '#FEF2F2', fontSize: 12, color: '#B91C1C' }}>{error}</div>
          )}
        </div>
        <div style={{ padding: 16, borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #CBD5F5', background: '#FFFFFF', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(mode)}
            disabled={saving || !canSave}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: saving || !canSave ? '#A5B4FC' : '#4F46E5', color: '#FFFFFF', cursor: saving || !canSave ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving…' : canSave ? 'Save' : 'View only'}
          </button>
        </div>
      </div>
    </div>
  );
};
