import React from 'react';
import type { MetricsTelemetryConfig, StageQueryKey } from '../types';
import { buildDefaultStageQueries } from '../utils/telemetry';
import { createBackendSrv } from '../utils/api';
import { detectRuntimeMode, detectGrafanaTransport } from '../utils/runtime';
import { StageMetricsGroup } from './StageMetricsGroup';

const { useState, useEffect } = React;

const runtimeMode = detectRuntimeMode();
const isRunningInGrafana = runtimeMode === 'grafana';
const grafanaTransport = detectGrafanaTransport(isRunningInGrafana);
const backendSrv = createBackendSrv(isRunningInGrafana, grafanaTransport);

type StageMetricsRailProps = {
  flowType: string;
  receivers: string[];
  processors: string[];
  exporters: string[];
  metricsSettings: MetricsTelemetryConfig;
  agentUid?: string;
  onConfigureMetrics: () => void;
};

// StageMetricsGroupProps is defined in StageMetricsGroup.tsx

export const STAGE_SUMMARY: Record<StageQueryKey, { title: string; color: string; border: string; description: string }> = {
  receivers: {
    title: 'Receivers',
    color: '#047857',
    border: '#6EE7B7',
    description: 'Monitors traffic entering each receiver and any drops/refusals.',
  },
  processors: {
    title: 'Processors',
    color: '#B45309',
    border: '#FCD34D',
    description: 'Observes items entering and exiting each processor in the pipeline.',
  },
  exporters: {
    title: 'Exporters',
    color: '#1D4ED8',
    border: '#BFDBFE',
    description: 'Shows attempted vs. successful sends for each exporter.',
  },
};

// escapeSelectorValue, extractPrometheusSample, and formatStageRate are provided by StageMetricsGroup via utils/metrics.ts

export const StageMetricsRail: React.FC<StageMetricsRailProps> = ({ flowType, receivers, processors, exporters, metricsSettings, agentUid, onConfigureMetrics }) => {
  const datasourceUid = metricsSettings.datasourceUid;
  const [datasource, setDatasource] = useState<{ id: number; uid: string; name: string } | null>(null);
  const [dsError, setDsError] = useState<string | null>(null);
  const [loadingDatasource, setLoadingDatasource] = useState(false);

  useEffect(() => {
    if (!datasourceUid) {
      setDatasource(null);
      setDsError('Select a Prometheus or Mimir datasource to populate per-stage metrics.');
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingDatasource(true);
      try {
        const ds = await backendSrv.get<{ id: number; uid: string; name: string }>(`/api/datasources/uid/${encodeURIComponent(datasourceUid)}`);
        if (!cancelled) {
          setDatasource(ds ?? null);
          setDsError(null);
        }
      } catch (err: any) {
        console.error('Failed to resolve datasource metadata', err);
        if (!cancelled) {
          setDatasource(null);
          setDsError(err?.message || 'Failed to resolve datasource metadata');
        }
      } finally {
        if (!cancelled) {
          setLoadingDatasource(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [datasourceUid]);

  const templates = metricsSettings.stageQueries || buildDefaultStageQueries();
  const totalComponents = receivers.length + processors.length + exporters.length;
  if (totalComponents === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: 16, padding: 16, borderRadius: 12, border: '1px solid #E5E7EB', background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Per-stage throughput ({flowType})</div>
          <div style={{ fontSize: 12, color: '#6B7280' }}>Each card runs the configured inbound/outbound queries with $stage and $pipeline placeholders.</div>
        </div>
        {!datasource && (
          <button
            type="button"
            onClick={onConfigureMetrics}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #2563EB', background: '#2563EB', color: '#FFFFFF', fontSize: 12, cursor: 'pointer' }}
          >
            Configure datasource
          </button>
        )}
      </div>
      {dsError && (
        <div style={{ border: '1px solid #FCD34D', background: '#FEF3C7', color: '#92400E', fontSize: 12, borderRadius: 8, padding: 10 }}>
          {dsError}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <StageMetricsGroup kind="receivers" stages={receivers} pipelineType={flowType} datasource={datasource} templates={templates} agentUid={agentUid} />
        <StageMetricsGroup kind="processors" stages={processors} pipelineType={flowType} datasource={datasource} templates={templates} agentUid={agentUid} />
        <StageMetricsGroup kind="exporters" stages={exporters} pipelineType={flowType} datasource={datasource} templates={templates} agentUid={agentUid} />
      </div>
      {loadingDatasource && (
        <div style={{ fontSize: 11, color: '#6B7280' }}>Resolving datasource metadata…</div>
      )}
    </div>
  );
};
