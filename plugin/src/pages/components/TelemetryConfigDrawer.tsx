import React from 'react';
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
  onMetricsChange: (next: MetricsTelemetryConfig) => void;
  onLogsChange: (next: LogsTelemetryConfig) => void;
  onSave: (mode: 'metrics' | 'logs') => void;
  onClose: () => void;
  saving: boolean;
};

export const TelemetryConfigDrawer: React.FC<TelemetryConfigDrawerProps> = ({
  open,
  mode,
  metricsConfig,
  logsConfig,
  onMetricsChange,
  onLogsChange,
  onSave,
  onClose,
  saving,
}) => {
  const [datasources, setDatasources] = useState<Array<{ id: number; uid: string; name: string; type: string }>>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!open) {
      setDatasources([]);
      setError(null);
      return;
    }
    let cancelled = false;
    const loadDatasources = async () => {
      setLoading(true);
      try {
        const response = await backendSrv.get<Array<{ id: number; uid: string; name: string; type: string }>>('/api/datasources');
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
  }, [open, mode]);

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
                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#1F2937' }}>
                  {key.toUpperCase()} query
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
                </label>
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
            disabled={saving}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: saving ? '#A5B4FC' : '#4F46E5', color: '#FFFFFF', cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
