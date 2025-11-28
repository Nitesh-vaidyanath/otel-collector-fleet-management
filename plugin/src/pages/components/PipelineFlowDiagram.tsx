import React from 'react';
import * as yaml from 'js-yaml';
import { PipelineMetricsPanelView, buildDefaultMetricQueries } from '../../components/PipelineMetricsPanelView';
import type { MetricsTelemetryConfig } from '../types';
import { StageMetricsRail } from './StageMetricsRail';

const { useMemo } = React;

export const PipelineFlowDiagram = React.memo(function PipelineFlowDiagram({
  config,
  pipelines,
  telemetry,
  agentName,
  agentUid,
  orgName,
  metricsSettings,
  onConfigureMetrics,
  agentLabels,
}: {
  config: string;
  pipelines: any[];
  telemetry: any[];
  agentName?: string;
  agentUid?: string;
  orgName?: string;
  metricsSettings: MetricsTelemetryConfig;
  onConfigureMetrics: () => void;
  agentLabels?: Record<string, string>;
}) {
  // Extract pod name from labels (check multiple possible label keys)
  const podName = agentLabels ? (
    agentLabels['pod'] || 
    agentLabels['k8s.pod.name'] || 
    agentLabels['k8s_pod_name'] ||
    agentLabels['host.name'] ||
    undefined
  ) : undefined;

  const pipelineFlows = useMemo(() => {
    const flows: Array<{ type: string; receivers: string[]; processors: string[]; exporters: string[] }> = [];
    if (!config) {
      return flows;
    }
    try {
      const parsed = yaml.load(config) as any;
      const servicePipelines = parsed?.service?.pipelines;
      if (servicePipelines && typeof servicePipelines === 'object') {
        Object.entries(servicePipelines).forEach(([pipelineType, pipelineConfig]) => {
          flows.push({
            type: pipelineType,
            receivers: (pipelineConfig as any)?.receivers || [],
            processors: (pipelineConfig as any)?.processors || [],
            exporters: (pipelineConfig as any)?.exporters || [],
          });
        });
      }
    } catch (err) {
      console.error('Failed to parse config for flow diagram:', err);
    }
    return flows;
  }, [config]);

  const flows = pipelineFlows.length > 0 ? pipelineFlows : Array.isArray(pipelines) ? pipelines : [];

  const hasTelemetryUsage = Array.isArray(telemetry) && telemetry.some((item: any) => {
    const type = String(item?.type || item?.signal || '').toLowerCase();
    return type.includes('metric') || type.includes('usage');
  });

  const renderColumn = (
    items: string[],
    header: string,
    palette: { background: string; border: string; color: string }
  ) => (
    <div style={{ flex: 1, minWidth: 200 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: palette.color, textAlign: 'center', marginBottom: 8 }}>{header}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length > 0 ? (
          items.map((name) => (
            <div
              key={name}
              style={{
                padding: 12,
                background: palette.background,
                border: `1px solid ${palette.border}`,
                borderRadius: 6,
                textAlign: 'center',
                fontSize: 12,
                color: palette.color,
              }}
            >
              {name}
            </div>
          ))
        ) : (
          <div
            style={{
              padding: 12,
              background: '#F3F4F6',
              border: '1px dashed #D1D5DB',
              borderRadius: 6,
              textAlign: 'center',
              fontSize: 11,
              color: '#9CA3AF',
            }}
          >
            None
          </div>
        )}
      </div>
    </div>
  );

  if (flows.length === 0) {
    return null;
  }

  return (
    <div style={{ width: '100%', margin: 0, padding: 0 }}>
      <div
        style={{
          width: '100%',
          padding: '24px 28px',
          background: '#F9FAFB',
          border: '1px solid #E5E7EB',
          borderRadius: 16,
          boxSizing: 'border-box',
          boxShadow: '0 12px 24px rgba(15,23,42,0.08)',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 12 }}>Pipeline Flow</div>
        <div
          style={{
            marginBottom: 20,
            padding: 16,
            background: '#F3F4F6',
            borderRadius: 8,
            border: '1px dashed #D1D5DB',
            fontSize: 12,
            color: '#4B5563',
            lineHeight: 1.6,
          }}
        >
        {hasTelemetryUsage
          ? 'Usage telemetry is arriving from this collector. Enable the metrics overlay to pull CPU/memory gauges and per-stage throughput cards from your Prometheus/Mimir datasource.'
          : 'The collector has not reported usage telemetry via OpAMP yet. Configure the agent to report own metrics or scrape it with your preferred monitoring stack to visualise CPU, memory, and throughput.'}
        </div>

        {flows.map((flow) => (
          <div
            key={flow.type}
            style={{
              width: '100%',
              marginBottom: 20,
              padding: '20px 24px',
              background: 'white',
              borderRadius: 10,
              border: '1px solid #E5E7EB',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 14, textTransform: 'capitalize' }}>
              {flow.type} pipeline
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, overflowX: 'auto' }}>
              {renderColumn(flow.receivers, `Receivers (${flow.receivers.length})`, {
                background: '#ECFDF5',
                border: '#6EE7B7',
                color: '#047857',
              })}
              <div style={{ fontSize: 24, color: '#9CA3AF' }}>→</div>
              {renderColumn(flow.processors, `Processors (${flow.processors.length})`, {
                background: '#FEF2F2',
                border: '#FECACA',
                color: '#B91C1C',
              })}
              <div style={{ fontSize: 24, color: '#9CA3AF' }}>→</div>
              {renderColumn(flow.exporters, `Exporters (${flow.exporters.length})`, {
                background: '#EFF6FF',
                border: '#BFDBFE',
                color: '#1D4ED8',
              })}
            </div>
            {metricsSettings?.enabled && (
              <StageMetricsRail
                flowType={flow.type}
                receivers={flow.receivers}
                processors={flow.processors}
                exporters={flow.exporters}
                metricsSettings={metricsSettings}
                agentUid={agentUid}
                onConfigureMetrics={onConfigureMetrics}
              />
            )}
            <div style={{ marginTop: 16 }}>
              {metricsSettings?.enabled && metricsSettings.datasourceUid ? (
                <PipelineMetricsPanelView
                  key={`${flow.type}-${metricsSettings.datasourceUid}-${metricsSettings.datasourceOrgId || 'default'}`}
                  pipelineType={flow.type}
                  agentUid={agentUid}
                  agentName={agentName}
                  orgName={orgName}
                  allowDisable={false}
                  initialEnabled
                  defaultQueries={
                    metricsSettings.queries && Object.keys(metricsSettings.queries).length > 0
                      ? metricsSettings.queries
                      : buildDefaultMetricQueries(flow.type, agentUid, podName)
                  }
                  defaultDatasourceUid={metricsSettings.datasourceUid}
                  datasourceOrgId={metricsSettings.datasourceOrgId}
                  readOnly
                />
              ) : (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    border: '1px dashed #CBD5F5',
                    background: '#F8FAFC',
                    fontSize: 12,
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <span>Metrics overlays are disabled for this pipeline. Configure a Prometheus-compatible datasource to enable live usage charts.</span>
                  <button
                    type="button"
                    onClick={onConfigureMetrics}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 4,
                      border: 'none',
                      background: '#2563EB',
                      color: '#FFFFFF',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Configure metrics
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        <div
          style={{
            marginTop: 12,
            padding: 16,
            background: '#F9FAFB',
            borderRadius: 8,
            border: '1px solid #E5E7EB',
            fontSize: 12,
            color: '#6B7280',
          }}
        >
          Collector logs and error feeds are not streamed through OpAMP yet. Use your existing logging/observability tooling (for example,
          <code>kubectl logs</code> or a centralised log store) to review collector output.
        </div>
      </div>
    </div>
  );
});
