import React, { useState, useEffect, useCallback } from 'react';
import { getBackendSrv } from '@grafana/runtime';
import { LOGS_QUERY_PLACEHOLDER } from '../constants';
import type { LogsTelemetryConfig } from '../types';

const rawBackendSrv = getBackendSrv();

export type LogsPanelProps = {
  settings: LogsTelemetryConfig;
  enabled: boolean;
  agentUid?: string;
  agentName?: string;
  orgName?: string;
  onConfigure: () => void;
  backendSrv: {
    get: <T = any>(url: string, options?: any) => Promise<T>;
  };
};

export const LogsPanelView: React.FC<LogsPanelProps> = ({ settings, enabled, agentUid, agentName, orgName, onConfigure, backendSrv }) => {
  const [datasource, setDatasource] = useState<{ id: number; uid: string; name: string; type: string } | null>(null);
  const [entries, setEntries] = useState<Array<{ ts: string; line: string }>>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const resolveDatasource = async () => {
      if (!settings.datasourceUid) {
        setDatasource(null);
        return;
      }
      try {
        const list = await backendSrv.get<Array<{ id: number; uid: string; name: string; type: string }>>('/api/datasources');
        if (!cancelled) {
          setDatasource(Array.isArray(list) ? list.find((ds) => ds.uid === settings.datasourceUid) || null : null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load data sources', err);
        }
      }
    };
    resolveDatasource();
    return () => {
      cancelled = true;
    };
  }, [settings.datasourceUid, backendSrv]);

  const buildQuery = useCallback(() => {
    const template = settings.query || LOGS_QUERY_PLACEHOLDER;
    return template
      .replace(/\$collector_uid/g, agentUid || '')
      .replace(/\$collector_name/g, agentName || '')
      .replace(/\$org_name/g, orgName || '');
  }, [settings.query, agentUid, agentName, orgName]);

  const fetchLogs = useCallback(async () => {
    if (!datasource) {
      setError('Select a Loki datasource to fetch logs.');
      return;
    }
    const query = buildQuery();
    if (!query || query.trim() === '') {
      setError('Query template is empty. Update the configuration.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 10 * 60 * 1000);
      const response = await rawBackendSrv.datasourceRequest({
        method: 'GET',
        url: `/api/datasources/proxy/${datasource.id}/loki/api/v1/query_range`,
        params: {
          query,
          limit: 50,
          direction: 'backward',
          start: start.toISOString(),
          end: end.toISOString(),
        },
      });
      const result = response?.data?.data?.result || [];
      const rows: Array<{ ts: string; line: string }> = [];
      result.forEach((stream: any) => {
        const values = stream?.values || [];
        values.forEach((value: any) => {
          if (Array.isArray(value) && value.length >= 2) {
            const ts = Number(value[0]);
            const tsMs = Number.isFinite(ts) ? ts / 1e6 : Date.now();
            rows.push({
              ts: new Date(tsMs).toLocaleString(),
              line: value[1],
            });
          }
        });
      });
      rows.sort((a, b) => (a.ts < b.ts ? 1 : -1));
      setEntries(rows.slice(0, 50));
    } catch (err: any) {
      console.error('Failed to query Loki', err);
      setError(err?.data?.message || err?.message || 'Failed to query Loki datasource.');
    } finally {
      setLoading(false);
    }
  }, [datasource, buildQuery]);

  if (!enabled) {
    return (
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          border: '1px dashed #CBD5F5',
          background: '#F8FAFC',
          color: '#475569',
          fontSize: 12,
        }}
      >
        Log snapshots are disabled. Enable them above and configure a Loki data source to view recent collector logs.
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: 8,
        border: '1px solid #E2E8F0',
        padding: 16,
        background: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Recent logs</div>
          <div style={{ fontSize: 12, color: '#6B7280' }}>{datasource ? `Datasource: ${datasource.name}` : 'Datasource not configured'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading || !datasource}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              background: loading || !datasource ? '#CBD5F5' : '#2563EB',
              color: '#FFFFFF',
              fontSize: 12,
              cursor: loading || !datasource ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Fetching…' : 'Refresh logs'}
          </button>
          <button
            type="button"
            onClick={onConfigure}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #E5E7EB',
              background: '#FFFFFF',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Configure
          </button>
        </div>
      </div>
      {error && (
        <div style={{ padding: 10, borderRadius: 6, border: '1px solid #FECACA', background: '#FEF2F2', fontSize: 12, color: '#B91C1C' }}>{error}</div>
      )}
      {entries.length === 0 ? (
        <div
          style={{
            padding: 12,
            borderRadius: 6,
            border: '1px dashed #CBD5F5',
            background: '#F8FAFC',
            fontSize: 12,
            color: '#475569',
          }}
        >
          No log entries fetched yet. Click "Refresh logs" to query the configured Loki datasource.
        </div>
      ) : (
        <div
          style={{
            maxHeight: 260,
            overflowY: 'auto',
            borderRadius: 6,
            border: '1px solid #E2E8F0',
            fontFamily: 'monospace',
            fontSize: 12,
            background: '#0F172A',
            color: '#E2E8F0',
          }}
        >
          {entries.map((entry, idx) => (
            <div key={`${entry.ts}-${idx}`} style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: '#93C5FD', marginRight: 8 }}>{entry.ts}</span>
              <span>{entry.line}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

