import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { getBackendSrv, getDataSourceSrv } from '@grafana/runtime';

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
  title?: string;
  onQueriesChange?: (queries: PipelineMetricQueries) => void;
  onDatasourceChange?: (datasource: { id: number; uid: string; name: string } | null) => void;
  readOnly?: boolean;
}

interface DatasourceSummary {
  id: number;
  uid: string;
  name: string;
  type: string;
}

interface QueryResultValues {
  cpu: number | null;
  memory: number | null;
  inbound: number | null;
  outbound: number | null;
}

interface QueryResultFormats {
  cpu: string;
  memory: string;
  inbound: string;
  outbound: string;
}

const EMPTY_VALUES: QueryResultValues = { cpu: null, memory: null, inbound: null, outbound: null };
const EMPTY_FORMATS: QueryResultFormats = { cpu: '—', memory: '—', inbound: '—', outbound: '—' };

const SUPPORTED_PROM_DATASOURCES = new Set(['prometheus', 'mimir', 'grafana-mimir-datasource', 'thanos']);

const METRIC_DEFINITIONS: Array<{ key: PipelineMetricKey; label: string; helper: string }> = [
  { key: 'cpu', label: 'CPU Usage', helper: 'Return utilisation in percentage (0-100).' },
  { key: 'memory', label: 'Memory Usage', helper: 'Return memory in megabytes.' },
  { key: 'inbound', label: 'Inbound Bandwidth', helper: 'Return inbound throughput in kilobytes per second.' },
  { key: 'outbound', label: 'Outbound Bandwidth', helper: 'Return outbound throughput in kilobytes per second.' },
];

export const createDefaultQueries = (pipelineType: string, agentUid?: string): PipelineMetricQueries => {
  const safeUid = agentUid && agentUid.trim() !== '' ? agentUid : '$collector_uid';
  const pipelineLabel = pipelineType || '$pipeline';
  const comment = '# Replace selectors so they match your Prometheus/Mimir metrics';
  return {
    cpu: `${comment}\n# Average CPU utilisation for ${pipelineLabel}\nsum(rate(otelcol_process_cpu_seconds_total{service_instance_id="${safeUid}"}[5m])) * 100`,
    memory: `${comment}\n# Resident memory for ${pipelineLabel}\navg_over_time(otelcol_process_resident_memory_bytes{service_instance_id="${safeUid}"}[5m]) / 1024 / 1024`,
    inbound: `${comment}\n# Inbound KB/s for ${pipelineLabel}\nsum(rate(otelcol_processor_batch_batch_send_size_sum{service_instance_id="${safeUid}", pipeline="${pipelineLabel}"}[5m])) / 1024`,
    outbound: `${comment}\n# Outbound KB/s for ${pipelineLabel}\nsum(rate(otelcol_exporter_sent_bytes{service_instance_id="${safeUid}", pipeline="${pipelineLabel}"}[5m])) / 1024`,
  };
};

const formatMetricValue = (key: PipelineMetricKey, value: number | null): string => {
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

const extractPrometheusValue = (response: any): number | null => {
  if (!response || response.status !== 'success' || !response.data) {
    return null;
  }
  const { data } = response;
  if (data.resultType === 'scalar' && Array.isArray(data.result) && data.result.length >= 2) {
    const value = parseFloat(data.result[1]);
    return Number.isFinite(value) ? value : null;
  }
  if (data.resultType === 'vector' && Array.isArray(data.result)) {
    if (data.result.length === 0) {
      return null;
    }
    const summed = data.result.reduce((acc: number, sample: any) => {
      if (!sample || !Array.isArray(sample.value) || sample.value.length < 2) {
        return acc;
      }
      const parsed = parseFloat(sample.value[1]);
      if (!Number.isFinite(parsed)) {
        return acc;
      }
      return acc + parsed;
    }, 0);
    return Number.isFinite(summed) ? summed : null;
  }
  return null;
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
  title = 'Custom Metrics Panel',
  onQueriesChange,
  onDatasourceChange,
  readOnly = false,
}) => {
  const [datasources, setDatasources] = useState<DatasourceSummary[]>([]);
  const [datasourceError, setDatasourceError] = useState<string | null>(null);
  const [selectedDatasource, setSelectedDatasource] = useState<DatasourceSummary | null>(null);
  const [queries, setQueries] = useState<PipelineMetricQueries>(() => defaultQueries ?? createDefaultQueries(pipelineType, agentUid));
  const [enabled, setEnabled] = useState(allowDisable ? initialEnabled : true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [values, setValues] = useState<QueryResultValues>({ ...EMPTY_VALUES });
  const [formattedValues, setFormattedValues] = useState<QueryResultFormats>({ ...EMPTY_FORMATS });
  const autoRunRef = useRef(false);

  useEffect(() => {
    if (defaultQueries) {
      setQueries(defaultQueries);
    }
  }, [defaultQueries]);

  const resolveDatasourceByUid = useCallback(async (uid: string) => {
    if (!uid) {
      return;
    }
    try {
      const dsSrv = getDataSourceSrv();
      const dsSettings: any = await dsSrv.get(uid);
      if (dsSettings && typeof dsSettings === 'object') {
        const summary: DatasourceSummary = {
          id: dsSettings.id,
          uid: dsSettings.uid,
          name: dsSettings.name,
          type: dsSettings.type,
        };
        setSelectedDatasource(summary);
        onDatasourceChange?.(summary);
      }
    } catch (err) {
      console.error('Failed to resolve datasource by UID', err);
    }
  }, [onDatasourceChange]);

  useEffect(() => {
    let mounted = true;
    const loadDatasources = async () => {
      try {
        const response = await getBackendSrv().get('/api/datasources');
        if (!mounted) {
          return;
        }
        const available = Array.isArray(response)
          ? (response as any[])
              .filter((item) => SUPPORTED_PROM_DATASOURCES.has(item.type))
              .map((item) => ({ id: item.id, uid: item.uid, name: item.name, type: item.type }))
          : [];
        setDatasources(available);
        setDatasourceError(available.length === 0 ? 'No Prometheus-compatible data sources were found.' : null);
        if (!selectedDatasource && available.length > 0) {
          setSelectedDatasource(available[0]);
          onDatasourceChange?.(available[0]);
        }
      } catch (err: any) {
        if (!mounted) {
          return;
        }
        console.error('Failed to load Grafana data sources', err);
        setDatasourceError(err?.message || 'Failed to load data sources. Ensure Prometheus or Mimir is available.');
      }
    };
    loadDatasources();
    return () => {
      mounted = false;
    };
  }, [selectedDatasource, onDatasourceChange]);

  useEffect(() => {
    if (defaultDatasourceUid) {
      resolveDatasourceByUid(defaultDatasourceUid);
    }
  }, [defaultDatasourceUid, resolveDatasourceByUid]);

  const handleDatasourceChangeInternal = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const id = Number(event.target.value);
      const summary = datasources.find((ds) => ds.id === id) || null;
      setSelectedDatasource(summary);
      onDatasourceChange?.(summary);
    },
    [datasources, onDatasourceChange]
  );

  const handleQueryChange = useCallback(
    (key: PipelineMetricKey, value: string) => {
      setQueries((prev) => {
        const next = { ...prev, [key]: value };
        onQueriesChange?.(next);
        return next;
      });
    },
    [onQueriesChange]
  );

  const runQueries = useCallback(async () => {
    if (!selectedDatasource) {
      setError('Select a Prometheus-compatible data source before running queries.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const metricPromises = (Object.keys(queries) as PipelineMetricKey[]).map(async (key) => {
        const query = queries[key];
        if (!query || query.trim() === '') {
          return { key, value: null } as { key: PipelineMetricKey; value: number | null };
        }
        const response = await getBackendSrv().datasourceRequest({
          method: 'GET',
          url: `/api/datasources/proxy/${selectedDatasource.id}/api/v1/query`,
          params: {
            query,
            time: Math.floor(Date.now() / 1000),
          },
        });
        const parsedValue = extractPrometheusValue(response?.data);
        return { key, value: parsedValue } as { key: PipelineMetricKey; value: number | null };
      });

      const resolved = await Promise.all(metricPromises);
      const nextValues: QueryResultValues = { ...EMPTY_VALUES };
      const nextFormats: QueryResultFormats = { ...EMPTY_FORMATS };
      resolved.forEach(({ key, value }) => {
        nextValues[key] = value;
        nextFormats[key] = formatMetricValue(key, value);
      });
      setValues(nextValues);
      setFormattedValues(nextFormats);
      setLastRunAt(Date.now());
    } catch (err: any) {
      console.error('Failed to execute Prometheus query', err);
      setError(err?.data?.message || err?.message || 'Query failed. Check your selectors and try again.');
    } finally {
      setLoading(false);
    }
  }, [queries, selectedDatasource]);

  const pipelineTitle = useMemo(() => `${pipelineType} pipeline`, [pipelineType]);

  useEffect(() => {
    autoRunRef.current = false;
  }, [pipelineType, selectedDatasource?.uid]);

  useEffect(() => {
    if (readOnly && selectedDatasource && !autoRunRef.current) {
      autoRunRef.current = true;
      runQueries();
    }
  }, [readOnly, selectedDatasource, runQueries]);

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          border: '1px solid #E5E7EB',
          background: '#F8FAFC',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
            {title}
            <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 8 }}>{pipelineTitle}</span>
          </div>
          {allowDisable && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1F2937' }}>
              <input type="checkbox" checked={enabled} onChange={() => setEnabled((prev) => !prev)} />
              Enable query panel
            </label>
          )}
        </div>

        {allowDisable && !enabled && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: '#FFFFFF',
              borderRadius: 6,
              border: '1px dashed #CBD5F5',
              color: '#475569',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            Toggle this panel and pick a Prometheus-compatible datasource to replace synthetic gauges. Until the OpAMP bridge emits real usage metrics, this is the recommended workaround.
            {datasourceError && <div style={{ marginTop: 8, color: '#B45309' }}>{datasourceError}</div>}
          </div>
        )}

        {(!allowDisable || enabled) && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {readOnly ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: '#1F2937' }}>
                  Data source: <strong>{selectedDatasource?.name || 'Not configured'}</strong>
                </div>
                <button
                  type="button"
                  onClick={runQueries}
                  disabled={loading || !selectedDatasource}
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
                  {loading ? 'Refreshing…' : 'Refresh metrics'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: '#1F2937' }}>Data source</div>
                <select
                  value={selectedDatasource?.id ?? ''}
                  onChange={handleDatasourceChangeInternal}
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
                <button
                  type="button"
                  onClick={runQueries}
                  disabled={loading || !selectedDatasource}
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
            )}

            {!readOnly && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 12,
                }}
              >
                {(Object.keys(queries) as PipelineMetricKey[]).map((key) => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1F2937' }}>{METRIC_DEFINITIONS.find((def) => def.key === key)?.label}</div>
                    <textarea
                      value={queries[key]}
                      onChange={(event) => handleQueryChange(key, event.target.value)}
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
                    <div style={{ fontSize: 11, color: '#64748B' }}>{METRIC_DEFINITIONS.find((def) => def.key === key)?.helper}</div>
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
                  <strong>Tip:</strong> Collector <code>{agentName || agentUid || 'unknown'}</code>, pipeline <code>{pipelineType}</code>, org{' '}
                  <code>{orgName || 'default'}</code>. Use labels such as <code>service_instance_id</code>, <code>namespace</code>, or <code>cluster</code>.
                </div>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
              }}
            >
              {(Object.keys(formattedValues) as PipelineMetricKey[]).map((key) => (
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
                  <div style={{ fontSize: 11, color: '#64748B' }}>{METRIC_DEFINITIONS.find((def) => def.key === key)?.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#0F172A' }}>{formattedValues[key]}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, color: '#64748B', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>Last updated: {lastRunAt ? new Date(lastRunAt).toLocaleString() : 'Not run yet'}</span>
              <span>Queries execute via Grafana's data-source proxy. Ensure the selected data source can reach your metrics backend.</span>
            </div>

            {error && (
              <div
                style={{
                  padding: 10,
                  borderRadius: 6,
                  border: '1px solid #FECACA',
                  background: '#FEF2F2',
                  fontSize: 12,
                  color: '#B91C1C',
                }}
              >
                {error}
              </div>
            )}

            {datasourceError && !selectedDatasource && (
              <div
                style={{
                  padding: 10,
                  borderRadius: 6,
                  border: '1px solid #FBBF24',
                  background: '#FFFBEB',
                  fontSize: 12,
                  color: '#92400E',
                }}
              >
                {datasourceError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
