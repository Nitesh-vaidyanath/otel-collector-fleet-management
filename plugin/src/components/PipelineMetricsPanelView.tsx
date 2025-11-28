import React from 'react';
import { getBackendSrv } from '@grafana/runtime';
import { createBackendSrv } from '../pages/utils/api';
import { detectRuntimeMode, detectGrafanaTransport } from '../pages/utils/runtime';

export type PipelineMetricKey = 'cpu' | 'memory' | 'inbound' | 'outbound';

export type PipelineMetricQueries = Record<PipelineMetricKey, string>;

export interface PipelineMetricsPanelViewProps {
  pipelineType: string;
  agentUid?: string;
  agentName?: string;
  orgName?: string;
  allowDisable?: boolean;
  initialEnabled?: boolean;
  defaultQueries?: PipelineMetricQueries;
  defaultDatasourceUid?: string | null;
  datasourceOrgId?: number | null;
  title?: string;
  readOnly?: boolean;
  onQueriesChange?: (next: PipelineMetricQueries) => void;
  onDatasourceChange?: (datasource: DatasourceSummary | null) => void;
}

export interface DatasourceSummary {
  id: number;
  uid: string;
  name: string;
  type: string;
}

const { useCallback, useEffect, useMemo, useRef, useState } = React;

const SUPPORTED_METRICS_DATASOURCES = new Set(['prometheus', 'mimir', 'grafana-mimir-datasource', 'thanos']);
const runtimeMode = detectRuntimeMode();
const isRunningInGrafana = runtimeMode === 'grafana';
const grafanaTransport = detectGrafanaTransport(isRunningInGrafana);
const backendSrv = createBackendSrv(isRunningInGrafana, grafanaTransport);
const rawBackendSrv = getBackendSrv();

const METRIC_LABELS: Array<{ key: PipelineMetricKey; label: string; helper: string }> = [
  { key: 'cpu', label: 'CPU Usage', helper: 'Example metric: otelcol_process_cpu_seconds_total' },
  { key: 'memory', label: 'Memory Usage', helper: 'Example metric: otelcol_process_memory_rss_bytes' },
  { key: 'inbound', label: 'Inbound Throughput', helper: 'Example metric: otelcol_processor_incoming_items_total' },
  { key: 'outbound', label: 'Outbound Throughput', helper: 'Example metric: otelcol_processor_outgoing_items_total' },
];

export const buildDefaultMetricQueries = (pipelineType: string, agentUid?: string): PipelineMetricQueries => {
  const safeUid = agentUid && agentUid.trim() !== '' ? agentUid : '$collector_uid';
  const safePod = '$collector_pod';
  const pipelineLabel = pipelineType && pipelineType.trim() !== '' ? pipelineType : '$pipeline';
  const prefix = '# Adjust selectors to match your collector metrics';
  return {
    cpu: `${prefix}\n# CPU utilisation for ${pipelineLabel}\nsum(rate(otelcol_process_cpu_seconds_total{service_instance_id="${safeUid}", pod=~"${safePod}"}[5m])) * 100`,
    memory: `${prefix}\n# Resident memory for ${pipelineLabel}\navg_over_time(otelcol_process_memory_rss_bytes{service_instance_id="${safeUid}", pod=~"${safePod}"}[5m]) / 1024 / 1024`,
    inbound: `${prefix}\n# Items accepted into ${pipelineLabel}\nsum(rate(otelcol_processor_incoming_items_total{service_instance_id="${safeUid}", pod=~"${safePod}", pipeline="${pipelineLabel}"}[5m]))`,
    outbound: `${prefix}\n# Items emitted from ${pipelineLabel}\nsum(rate(otelcol_processor_outgoing_items_total{service_instance_id="${safeUid}", pod=~"${safePod}", pipeline="${pipelineLabel}"}[5m]))`,
  };
};

const extractPrometheusValue = (response: any): number | null => {
  if (!response || response.status !== 'success') {
    return null;
  }
  const data = response.data;
  if (!data) {
    return null;
  }
  if (data.resultType === 'scalar' && Array.isArray(data.result) && data.result.length >= 2) {
    const value = parseFloat(data.result[1]);
    return Number.isFinite(value) ? value : null;
  }
  if (data.resultType === 'vector' && Array.isArray(data.result)) {
    if (data.result.length === 0) {
      return null;
    }
    const accumulated = data.result.reduce((acc: number, sample: any) => {
      if (!sample || !Array.isArray(sample.value) || sample.value.length < 2) {
        return acc;
      }
      const next = parseFloat(sample.value[1]);
      if (!Number.isFinite(next)) {
        return acc;
      }
      return acc + next;
    }, 0);
    return Number.isFinite(accumulated) ? accumulated : null;
  }
  return null;
};

const extractPrometheusTimeSeries = (response: any): Array<{ time: number; value: number }> => {
  if (!response || response.status !== 'success') {
    return [];
  }
  const data = response.data;
  if (!data || data.resultType !== 'matrix' || !Array.isArray(data.result)) {
    return [];
  }
  const series: Array<{ time: number; value: number }> = [];
  for (const result of data.result) {
    if (result.values && Array.isArray(result.values)) {
      for (const [timestamp, value] of result.values) {
        const time = parseFloat(timestamp);
        const val = parseFloat(value);
        if (Number.isFinite(time) && Number.isFinite(val)) {
          series.push({ time, value: val });
        }
      }
    }
  }
  // Sort by time
  series.sort((a, b) => a.time - b.time);
  return series;
};

const formatValue = (key: PipelineMetricKey, value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  switch (key) {
    case 'cpu':
      return `${value.toFixed(1)} %`;
    case 'memory':
      return `${value.toFixed(1)} MB`;
    case 'inbound':
    case 'outbound':
      return `${value.toFixed(1)} KB/s`;
    default:
      return value.toFixed(2);
  }
};

// Simple SVG-based time series chart component
const TimeSeriesChart: React.FC<{
  data: Array<{ time: number; value: number }>;
  label: string;
  color?: string;
  height?: number;
}> = ({ data, label, color = '#2563EB', height = 120 }) => {
  if (!data || data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 12 }}>
        No data available
      </div>
    );
  }

  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const width = 400;
  const chartHeight = height - padding.top - padding.bottom;
  const chartWidth = width - padding.left - padding.right;

  const minTime = Math.min(...data.map(d => d.time));
  const maxTime = Math.max(...data.map(d => d.time));
  const minValue = Math.min(...data.map(d => d.value));
  const maxValue = Math.max(...data.map(d => d.value));
  const valueRange = maxValue - minValue || 1;

  const scaleX = (time: number) => ((time - minTime) / (maxTime - minTime || 1)) * chartWidth;
  const scaleY = (value: number) => chartHeight - ((value - minValue) / valueRange) * chartHeight;

  const points = data.map(d => `${scaleX(d.time) + padding.left},${scaleY(d.value) + padding.top}`).join(' ');

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString();
  };

  const formatValue = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toFixed(1);
  };

  return (
    <div style={{ width: '100%', height, background: '#FFFFFF', borderRadius: 6, border: '1px solid #E2E8F0', padding: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#1F2937', marginBottom: 8 }}>{label}</div>
      <svg width={width} height={height} style={{ display: 'block' }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + ratio * chartHeight;
          return (
            <line
              key={`grid-${ratio}`}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="#E5E7EB"
              strokeWidth={1}
            />
          );
        })}
        {/* Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = minValue + ratio * valueRange;
          const y = padding.top + (1 - ratio) * chartHeight;
          return (
            <text
              key={`y-label-${ratio}`}
              x={padding.left - 5}
              y={y + 4}
              textAnchor="end"
              fontSize="10"
              fill="#6B7280"
            >
              {formatValue(value)}
            </text>
          );
        })}
        {/* Chart line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2}
        />
        {/* Data points */}
        {data.map((d, idx) => (
          <circle
            key={idx}
            cx={scaleX(d.time) + padding.left}
            cy={scaleY(d.value) + padding.top}
            r={2}
            fill={color}
          />
        ))}
        {/* X-axis */}
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="#9CA3AF"
          strokeWidth={1}
        />
        {/* Time labels */}
        {data.length > 0 && (
          <>
            <text
              x={padding.left}
              y={height - 5}
              fontSize="10"
              fill="#6B7280"
            >
              {formatTime(data[0].time)}
            </text>
            <text
              x={width - padding.right}
              y={height - 5}
              fontSize="10"
              fill="#6B7280"
              textAnchor="end"
            >
              {formatTime(data[data.length - 1].time)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
};

export const PipelineMetricsPanelView: React.FC<PipelineMetricsPanelViewProps> = ({
  pipelineType,
  agentUid,
  agentName,
  orgName,
  allowDisable = false,
  initialEnabled = true,
  defaultQueries,
  defaultDatasourceUid = null,
  datasourceOrgId = null,
  title = 'Custom Metrics Panel',
  readOnly = false,
  onQueriesChange,
  onDatasourceChange,
}) => {
  const [datasources, setDatasources] = useState<DatasourceSummary[]>([]);
  const [datasourceError, setDatasourceError] = useState<string | null>(null);
  const [selectedDatasource, setSelectedDatasource] = useState<DatasourceSummary | null>(null);
  const [queries, setQueries] = useState<PipelineMetricQueries>(() => defaultQueries ?? buildDefaultMetricQueries(pipelineType, agentUid));
  const [enabled, setEnabled] = useState<boolean>(allowDisable ? initialEnabled : true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [values, setValues] = useState<Record<PipelineMetricKey, string>>({ cpu: '—', memory: '—', inbound: '—', outbound: '—' });
  const [timeSeriesData, setTimeSeriesData] = useState<Record<PipelineMetricKey, any[]>>({ cpu: [], memory: [], inbound: [], outbound: [] });
  const [viewMode, setViewMode] = useState<'values' | 'charts'>('charts');
  const autoRunRef = useRef<boolean>(false);
  const orgHeaders = useMemo(
    () => (datasourceOrgId ? { 'X-Grafana-Org-Id': String(datasourceOrgId) } : undefined),
    [datasourceOrgId]
  );

  useEffect(() => {
    if (defaultQueries) {
      setQueries(defaultQueries);
    }
  }, [defaultQueries]);

  // Clear selected datasource when org changes to force refresh
  useEffect(() => {
    if (datasourceOrgId !== null) {
      setSelectedDatasource(null);
    }
  }, [datasourceOrgId]);

  useEffect(() => {
    let mounted = true;
    const loadDatasources = async () => {
      try {
        const response = await backendSrv.get('/api/datasources', { headers: orgHeaders });
        if (!mounted) {
          return;
        }
        const available = Array.isArray(response)
          ? (response as any[])
              .filter((item) => SUPPORTED_METRICS_DATASOURCES.has(item.type))
              .map((item) => ({ id: item.id, uid: item.uid, name: item.name, type: item.type }))
          : [];
        setDatasources(available);
        setDatasourceError(available.length === 0 ? 'No Prometheus-compatible data sources were found.' : null);
        
        // Always try to select default datasource when org changes or datasource list loads
        if (defaultDatasourceUid) {
          const match = available.find((ds) => ds.uid === defaultDatasourceUid);
          if (match) {
            setSelectedDatasource(match);
            onDatasourceChange?.(match);
            return;
          }
        }
        // If no default and no selection, select first available
        if (!selectedDatasource && available.length > 0 && !readOnly) {
          setSelectedDatasource(available[0]);
          onDatasourceChange?.(available[0]);
        }
      } catch (err: any) {
        if (!mounted) {
          return;
        }
        console.error('Failed to load datasources', err);
        setDatasourceError(err?.message || 'Failed to load data sources.');
      }
    };
    loadDatasources();
    return () => {
      mounted = false;
    };
  }, [defaultDatasourceUid, onDatasourceChange, readOnly, orgHeaders, datasourceOrgId]);

  useEffect(() => {
    if (!defaultDatasourceUid || !datasources || datasources.length === 0) {
      return;
    }
    if (selectedDatasource && selectedDatasource.uid === defaultDatasourceUid) {
      return;
    }
    const match = datasources.find((ds) => ds.uid === defaultDatasourceUid);
    if (match) {
      setSelectedDatasource(match);
      onDatasourceChange?.(match);
    }
  }, [datasources, defaultDatasourceUid, onDatasourceChange, selectedDatasource]);

  const updateQuery = useCallback((key: PipelineMetricKey, value: string) => {
    setQueries((prev) => {
      const next = { ...prev, [key]: value };
      onQueriesChange?.(next);
      return next;
    });
  }, [onQueriesChange]);

  const runQueries = useCallback(async () => {
    if (!selectedDatasource) {
      setError('Select a datasource before running queries.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const now = Math.floor(Date.now() / 1000);
      const start = now - 3600; // 1 hour range for time series
      const results: Record<PipelineMetricKey, string> = { cpu: '—', memory: '—', inbound: '—', outbound: '—' };
      const timeSeries: Record<PipelineMetricKey, any[]> = { cpu: [], memory: [], inbound: [], outbound: [] };
      
      for (const { key } of METRIC_LABELS) {
        const query = queries[key];
        if (!query || query.trim() === '') {
          results[key] = '—';
          timeSeries[key] = [];
          continue;
        }
        
        // Run instant query for current value
        try {
          const instantResponse = await rawBackendSrv.datasourceRequest({
            method: 'GET',
            url: `/api/datasources/proxy/${selectedDatasource.id}/api/v1/query`,
            params: { query, time: now },
            headers: orgHeaders,
          });
          const value = extractPrometheusValue(instantResponse?.data);
          results[key] = formatValue(key, value);
        } catch (err) {
          console.warn(`Instant query failed for ${key}:`, err);
        }
        
        // Run range query for time series chart
        try {
          const rangeResponse = await rawBackendSrv.datasourceRequest({
            method: 'GET',
            url: `/api/datasources/proxy/${selectedDatasource.id}/api/v1/query_range`,
            params: { query, start, end: now, step: '60' },
            headers: orgHeaders,
          });
          const seriesData = extractPrometheusTimeSeries(rangeResponse?.data);
          timeSeries[key] = seriesData;
        } catch (err) {
          console.warn(`Range query failed for ${key}:`, err);
          timeSeries[key] = [];
        }
      }
      setValues(results);
      setTimeSeriesData(timeSeries);
      setLastRunAt(Date.now());
    } catch (err: any) {
      console.error('Failed to execute Prometheus queries', err);
      setError(err?.data?.message || err?.message || 'Query failed. Check selectors and try again.');
    } finally {
      setLoading(false);
    }
  }, [queries, selectedDatasource, orgHeaders]);

  useEffect(() => {
    if (readOnly && selectedDatasource && !autoRunRef.current) {
      autoRunRef.current = true;
      runQueries();
    }
  }, [readOnly, selectedDatasource, runQueries]);

  const handleDatasourceChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(event.target.value);
    const match = datasources.find((item) => item.id === id) || null;
    setSelectedDatasource(match);
    onDatasourceChange?.(match);
  }, [datasources, onDatasourceChange]);

  const isReadonlyAndDisabled = readOnly || !allowDisable;

  return (
    <div style={{ width: '100%' }}>
      <div style={{ padding: 16, background: '#F8FAFC', borderRadius: 8, border: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
            {title}
            <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 8 }}>
              {pipelineType} pipeline
            </span>
          </div>
          {allowDisable && !readOnly && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1F2937' }}>
              <input type="checkbox" checked={enabled} onChange={() => setEnabled((prev) => !prev)} />
              Enable panel
            </label>
          )}
        </div>

        {(!allowDisable || enabled || readOnly) ? (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: '#1F2937' }}>Data source</div>
              {readOnly ? (
                <div style={{ fontSize: 12, color: '#1F2937', fontWeight: 600 }}>
                  {selectedDatasource?.name || 'Not configured'}
                </div>
              ) : (
                <select
                  value={selectedDatasource?.id ?? ''}
                  onChange={handleDatasourceChange}
                  style={{
                    minWidth: 220,
                    padding: '6px 10px',
                    borderRadius: 4,
                    border: '1px solid #CBD5F5',
                    fontSize: 12,
                    color: '#1F2937',
                    background: '#FFFFFF',
                  }}
                >
                  <option value="" disabled>
                    {datasourceError ? 'No compatible data source' : 'Select data source'}
                  </option>
                  {datasources.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name} ({ds.type})
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={runQueries}
                disabled={loading || !selectedDatasource || (!enabled && !isReadonlyAndDisabled)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  border: 'none',
                  background: loading ? '#CBD5F5' : '#2563EB',
                  color: '#FFFFFF',
                  fontSize: 12,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Running…' : 'Run queries'}
              </button>
            </div>

            {!readOnly && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                {METRIC_LABELS.map(({ key, label, helper }) => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1F2937' }}>{label}</div>
                    <textarea
                      value={queries[key] ?? ''}
                      onChange={(event) => updateQuery(key, event.target.value)}
                      rows={6}
                      style={{
                        padding: 8,
                        borderRadius: 4,
                        border: '1px solid #CBD5F5',
                        fontFamily: 'monospace',
                        fontSize: 12,
                        background: '#FFFFFF',
                        color: '#0F172A',
                      }}
                    />
                    <div style={{ fontSize: 11, color: '#64748B' }}>{helper}</div>
                  </div>
                ))}
                <div
                  style={{
                    padding: 10,
                    background: '#F8FAFC',
                    borderRadius: 6,
                    border: '1px solid #E2E8F0',
                    fontSize: 11,
                    color: '#475569',
                  }}
                >
                  <strong>Tip:</strong> collector <code>{agentName || agentUid || 'unknown'}</code>, pipeline <code>{pipelineType}</code>, org <code>{orgName || 'default'}</code>.
                </div>
              </div>
            )}

            {/* View mode toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#64748B' }}>View:</span>
              <button
                type="button"
                onClick={() => setViewMode('values')}
                style={{
                  padding: '4px 12px',
                  borderRadius: 4,
                  border: '1px solid #CBD5F5',
                  background: viewMode === 'values' ? '#2563EB' : '#FFFFFF',
                  color: viewMode === 'values' ? '#FFFFFF' : '#1F2937',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Values
              </button>
              <button
                type="button"
                onClick={() => setViewMode('charts')}
                style={{
                  padding: '4px 12px',
                  borderRadius: 4,
                  border: '1px solid #CBD5F5',
                  background: viewMode === 'charts' ? '#2563EB' : '#FFFFFF',
                  color: viewMode === 'charts' ? '#FFFFFF' : '#1F2937',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Charts
              </button>
            </div>

            {viewMode === 'values' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                {METRIC_LABELS.map(({ key, label }) => (
                  <div
                    key={key}
                    style={{
                      padding: 12,
                      borderRadius: 6,
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#64748B' }}>{label}</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#0F172A' }}>{values[key]}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
                {METRIC_LABELS.map(({ key, label }) => (
                  <TimeSeriesChart
                    key={key}
                    data={timeSeriesData[key] || []}
                    label={label}
                    color={key === 'cpu' ? '#EF4444' : key === 'memory' ? '#3B82F6' : key === 'inbound' ? '#10B981' : '#F59E0B'}
                  />
                ))}
              </div>
            )}

            <div style={{ fontSize: 11, color: '#64748B', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>Last updated: {lastRunAt ? new Date(lastRunAt).toLocaleString() : 'Not run yet'}</span>
              <span>Queries execute via Grafana datasource proxy.</span>
            </div>

            {error && (
              <div style={{ padding: 10, borderRadius: 6, border: '1px solid #FECACA', background: '#FEF2F2', fontSize: 12, color: '#B91C1C' }}>{error}</div>
            )}

            {datasourceError && !selectedDatasource && (
              <div style={{ padding: 10, borderRadius: 6, border: '1px solid #FBBF24', background: '#FFFBEB', fontSize: 12, color: '#92400E' }}>{datasourceError}</div>
            )}
          </div>
        ) : (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 6,
              border: '1px dashed #CBD5F5',
              background: '#FFFFFF',
              color: '#475569',
              fontSize: 12,
            }}
          >
            Enable this panel to run Prometheus queries for the {pipelineType} pipeline.
          </div>
        )}
      </div>
    </div>
  );
};
