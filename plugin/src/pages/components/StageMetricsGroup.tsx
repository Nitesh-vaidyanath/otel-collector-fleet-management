import React from 'react';
import { getBackendSrv } from '@grafana/runtime';
import type { StageQueryKey, StageMetricTemplates } from '../types';
import { extractPrometheusSample, formatStageRate, escapeSelectorValue } from '../utils/metrics';
import { buildDefaultStageQueries } from '../utils/telemetry';
import { createBackendSrv } from '../utils/api';
import { detectRuntimeMode, detectGrafanaTransport } from '../utils/runtime';
import { STAGE_SUMMARY } from './StageMetricsRail';

const { useState, useEffect, useCallback } = React;

const runtimeMode = detectRuntimeMode();
const isRunningInGrafana = runtimeMode === 'grafana';
const grafanaTransport = detectGrafanaTransport(isRunningInGrafana);
const backendSrv = createBackendSrv(isRunningInGrafana, grafanaTransport);
const rawBackendSrv = getBackendSrv();

export type StageMetricsGroupProps = {
  kind: StageQueryKey;
  stages: string[];
  pipelineType: string;
  datasource: { id: number; uid: string; name: string } | null;
  templates: StageMetricTemplates;
  agentUid?: string;
};

export const StageMetricsGroup: React.FC<StageMetricsGroupProps> = ({ kind, stages, pipelineType, datasource, templates, agentUid }) => {
  const [values, setValues] = useState<Record<string, { inbound: string; outbound: string }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const template = templates[kind] || buildDefaultStageQueries()[kind];

  const applyPlaceholders = useCallback((rawQuery: string, stageName: string) => {
    if (!rawQuery || rawQuery.trim() === '') {
      return '';
    }
    const resolvedCollector = agentUid && agentUid.trim() !== '' ? escapeSelectorValue(agentUid) : '$collector_uid';
    const resolvedPipeline = pipelineType && pipelineType.trim() !== '' ? escapeSelectorValue(pipelineType) : '$pipeline';
    const resolvedStage = stageName && stageName.trim() !== '' ? escapeSelectorValue(stageName) : '$stage';
    return rawQuery
      .replace(/\$collector_uid/g, resolvedCollector)
      .replace(/\$pipeline/g, resolvedPipeline)
      .replace(/\$stage/g, resolvedStage);
  }, [agentUid, pipelineType]);

  const executeQuery = useCallback(async (query: string, now: number) => {
    if (!datasource || !query || query.trim() === '') {
      return null;
    }
    const response = await rawBackendSrv.datasourceRequest({
      method: 'GET',
      url: `/api/datasources/proxy/${datasource.id}/api/v1/query`,
      params: { query, time: now },
    });
    return extractPrometheusSample(response?.data);
  }, [datasource]);

  const runQueries = useCallback(async () => {
    if (!datasource || stages.length === 0) {
      setValues({});
      setLastUpdated(null);
      setError(stages.length === 0 ? null : 'Datasource not ready');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const now = Math.floor(Date.now() / 1000);
      const next: Record<string, { inbound: string; outbound: string }> = {};
      for (const stageName of stages) {
        const inboundQuery = applyPlaceholders(template.inbound || '', stageName);
        const outboundQuery = applyPlaceholders(template.outbound || '', stageName);
        const inboundValue = inboundQuery ? await executeQuery(inboundQuery, now) : null;
        const outboundValue = outboundQuery ? await executeQuery(outboundQuery, now) : null;
        next[stageName] = {
          inbound: formatStageRate(inboundValue),
          outbound: formatStageRate(outboundValue),
        };
      }
      setValues(next);
      setLastUpdated(Date.now());
    } catch (err: any) {
      console.error('Stage metrics query failed', err);
      setError(err?.data?.message || err?.message || 'Query failed. Adjust selectors and try again.');
    } finally {
      setLoading(false);
    }
  }, [datasource, stages, template, applyPlaceholders, executeQuery]);

  useEffect(() => {
    if (!datasource || stages.length === 0) {
      return;
    }
    runQueries();
    const interval = setInterval(runQueries, 60000);
    return () => clearInterval(interval);
  }, [datasource, stages, runQueries]);

  const palette = STAGE_SUMMARY[kind];

  return (
    <div style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: 14, background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: palette.color }}>{palette.title} ({stages.length})</div>
      <div style={{ fontSize: 11, color: '#6B7280' }}>{palette.description}</div>
      {stages.length === 0 ? (
        <div style={{ fontSize: 12, color: '#6B7280' }}>None configured in this pipeline.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stages.map((stage) => (
            <div key={`${kind}-${stage}`} style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{stage}</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 120px' }}>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>Inbound</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{values[stage]?.inbound ?? '—'}</div>
                </div>
                <div style={{ flex: '1 1 120px' }}>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>Outbound</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{values[stage]?.outbound ?? '—'}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 11, color: '#6B7280' }}>
        <span>Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'Not run yet'}</span>
        <button
          type="button"
          onClick={runQueries}
          disabled={loading || !datasource || stages.length === 0}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #CBD5F5',
            background: loading ? '#E5E7EB' : '#F8FAFC',
            cursor: loading || !datasource || stages.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Running…' : 'Refresh'}
        </button>
      </div>
      {error && (
        <div style={{ fontSize: 11, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: 8 }}>{error}</div>
      )}
    </div>
  );
};
