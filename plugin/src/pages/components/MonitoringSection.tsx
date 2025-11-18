import React from 'react';
import type { Agent, Bridge, FleetTelemetrySettings } from '../types';
import { getDefaultTelemetrySettingsState } from '../utils/telemetry';
import { normalizeTelemetryItems, getStatusBadge } from '../utils/helpers';
import { CapabilityBadges } from '../utils/capabilities';
import { TelemetryToggleCard } from './TelemetryToggleCard';
import { LogsPanelView } from './LogsPanelView';
import { PipelineFlowDiagram } from './PipelineFlowDiagram';
import { createBackendSrv } from '../utils/api';
import { detectRuntimeMode, detectGrafanaTransport } from '../utils/runtime';

const runtimeMode = detectRuntimeMode();
const isRunningInGrafana = runtimeMode === 'grafana';
const grafanaTransport = detectGrafanaTransport(isRunningInGrafana);
const backendSrv = createBackendSrv(isRunningInGrafana, grafanaTransport);

const { useState, useEffect, useMemo } = React;

export function MonitoringSection({
  agents,
  bridges,
  telemetrySettings,
  telemetryLoading,
  onToggleMetrics,
  onToggleLogs,
  telemetryDatasourceHints,
  onConfigureTelemetry,
}: {
  agents: Agent[];
  bridges: Bridge[];
  telemetrySettings: FleetTelemetrySettings;
  telemetryLoading: boolean;
  onToggleMetrics: (next: boolean) => void;
  onToggleLogs: (next: boolean) => void;
  telemetryDatasourceHints: { metrics?: string; logs?: string };
  onConfigureTelemetry: (mode: 'metrics' | 'logs') => void;
}) {
  const [selectedAgentUID, setSelectedAgentUID] = useState('');
  const [monitoringData, setMonitoringData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const metricsSettings = telemetrySettings?.metrics ?? getDefaultTelemetrySettingsState().metrics;
  const logsSettings = telemetrySettings?.logs ?? getDefaultTelemetrySettingsState().logs;

  // Prevent selecting bridges - only collectors can be monitored (bridges don't have pipelines/configs)
  useEffect(() => {
    if (selectedAgentUID) {
      // Check if selected agent is a bridge
      const isBridge = bridges.some(b => b.agentUid === selectedAgentUID);
      if (isBridge) {
        // Clear selection if a bridge is selected - bridges don't have collector configs/pipelines
        setSelectedAgentUID('');
        setMonitoringData(null);
      }
    }
  }, [selectedAgentUID, bridges]);

  const loadMonitoringData = async (agentUID: string, skipLoading = false) => {
    if (!agentUID) {
      setMonitoringData(null);
      return;
    }
    // Prevent loading monitoring data for bridges
    const isBridge = bridges.some(b => b.agentUid === agentUID);
    if (isBridge) {
      setMonitoringData(null);
      return;
    }
    if (!skipLoading) {
      setLoading(true);
    }
    try {
      // Get agent details with current config and all telemetry data
      const [agentResponse, currentConfigResponse, activityResponse, telemetryResponse, healthResponse, pipelinesResponse] = await Promise.all([
        backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}`),
        backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/current-config`),
        backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/activity?limit=10`),
        backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/telemetry?limit=50`).catch(() => ({ items: [] })),
        backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/health?limit=20`).catch(() => ({ items: [], current: {} })),
        backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/pipelines`).catch(() => ({ items: [] }))
      ]);
      
      setMonitoringData((prev: any) => ({
        agent: agentResponse,
        currentConfig: currentConfigResponse,
        recentActivity: activityResponse.items || [],
        telemetry: normalizeTelemetryItems(telemetryResponse.items),
        health: healthResponse,
        pipelines: pipelinesResponse.items || []
      }));
    } catch (err: any) {
      console.error('Failed to load monitoring data:', err);
      if (!skipLoading) {
        alert('Failed to load monitoring data: ' + (err.message || 'Unknown error'));
      }
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
  };

  // Separate function to refresh only metrics/telemetry without full page reload
  const refreshMetricsOnly = async (agentUID: string) => {
    if (!agentUID) return;
    try {
      // Fetch agent details, telemetry, health, and pipelines (agent details needed for status updates)
      const [agentResponse, telemetryResponse, healthResponse, pipelinesResponse] = await Promise.all([
        backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}`).catch(() => (null)),
        backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/telemetry?limit=50`).catch(() => ({ items: [] })),
        backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/health?limit=20`).catch(() => ({ items: [], current: {} })),
        backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/pipelines`).catch(() => ({ items: [] }))
      ]);
      
      // Update metrics-related data AND agent status (for health monitoring)
      setMonitoringData((prev: any) => ({
        ...prev,
        agent: agentResponse || prev.agent, // Update agent if available (includes status)
        telemetry: normalizeTelemetryItems(telemetryResponse.items),
        health: healthResponse,
        pipelines: pipelinesResponse.items || []
      }));
    } catch (err: any) {
      console.error('Failed to refresh metrics:', err);
      // Silently fail for background refresh
    }
  };

  useEffect(() => {
    if (selectedAgentUID) {
      loadMonitoringData(selectedAgentUID);
      // Auto-refresh only metrics/telemetry every 5 seconds without full page reload
      const interval = setInterval(() => {
        refreshMetricsOnly(selectedAgentUID);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedAgentUID]);

  // Calculate total agents including collectors from bridges
  const allCollectors = [
    ...agents, // Standalone agents
    ...bridges.flatMap(b => b.collectors || []) // Collectors from bridges
  ];
  const onlineAgents = allCollectors.filter(a => a.status === 'online');
  const totalAgents = allCollectors.length;
  const resolvedAgentCaps = useMemo(() => {
    if (monitoringData?.agent?.agent?.capabilities) {
      return monitoringData.agent.agent.capabilities;
    }
    if (monitoringData?.agent?.capabilities) {
      return monitoringData.agent.capabilities;
    }
    const fallback = agents.find((a) => a.agentUid === selectedAgentUID);
    return fallback?.capabilities || undefined;
  }, [monitoringData, agents, selectedAgentUID]);
  const healthCapability = resolvedAgentCaps?.reports_health;
  const logsCapability = resolvedAgentCaps?.reports_own_logs;
  const supportsHealthReports = healthCapability === undefined || healthCapability === true;
  const supportsOwnLogs = logsCapability === undefined || logsCapability === true;
  const telemetryLogs = Array.isArray(monitoringData?.telemetry)
    ? monitoringData.telemetry.filter((item: any) =>
        String(item?.type || item?.signal || item?.category || '').toLowerCase().includes('log')
      )
    : [];
  const currentConfig = monitoringData?.currentConfig || null;
  const hasCurrentConfigLoaded = Boolean(currentConfig && (currentConfig.hasAgentConfig || currentConfig.hasConfig));
  const pipelineConfigValue = currentConfig ? (currentConfig.agentConfig || currentConfig.config) : '';
  const pipelineConfigString = (() => {
    if (!pipelineConfigValue) {
      return '';
    }
    if (typeof pipelineConfigValue === 'string') {
      return pipelineConfigValue;
    }
    try {
      return JSON.stringify(pipelineConfigValue, null, 2);
    } catch {
      return String(pipelineConfigValue);
    }
  })();
  const hasPipelineDiagramData = pipelineConfigString.trim().length > 0;
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        width: '100%',
        background: 'white',
        borderRadius: 8,
        border: '1px solid #E5E7EB',
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: 24,
        boxSizing: 'border-box'
      }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 20 }}>
          Agent Monitoring & Metrics
        </h3>
        
        {/* Important Note About Metrics */}
        <div style={{
          marginBottom: 20,
          padding: 16,
          background: '#EFF6FF',
          borderRadius: 6,
          border: '2px solid #3B82F6'
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1E40AF', marginBottom: 8 }}>
            💡 How Metrics, Logs, and Traces Work
          </div>
          <div style={{ fontSize: 12, color: '#1E3A8A', lineHeight: '1.6' }}>
            <strong>OpAMP vs. Telemetry Data:</strong>
            <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
              <li><strong>OpAMP (this interface):</strong> Manages agents (health, config status, pipeline status, metrics visualization). OpAMP provides agent management and displays metrics/logs/traces flow in the pipeline diagram below.</li>
              <li><strong>Telemetry Data (metrics/logs/traces):</strong> Collected by <strong>receivers</strong>, processed by <strong>processors</strong>, and sent via configured <strong>exporters</strong> in the agent's configuration. The pipeline flow diagram shows real-time metrics for each component.</li>
            </ul>
            <strong>Metrics & Logs Display:</strong>
            <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
              <li>📊 <strong>Pipeline Flow Diagram:</strong> Shows real-time metrics (CPU, Memory, Bandwidth, Throughput) for receivers, processors, and exporters</li>
              <li>📈 <strong>Agent Metrics:</strong> Overall agent resource usage (CPU, Memory, Bandwidth, Throughput) displayed at the top</li>
              <li>📋 <strong>Telemetry Data:</strong> Historical telemetry data (metrics, logs, traces) is shown in the Telemetry Data section below</li>
            </ul>
            <strong>To send telemetry to external backends:</strong>
            <ol style={{ margin: '8px 0', paddingLeft: 20 }}>
              <li>Generate a configuration with <strong>receivers</strong> (to collect data) and <strong>exporters</strong> (to send data to your backend)</li>
              <li>Configure exporters with endpoints (e.g., OTLP exporter pointing to your metrics backend)</li>
              <li>Save and push the configuration to the agent</li>
              <li>The agent will send metrics/logs/traces to your configured exporters while displaying metrics here</li>
            </ol>
            <strong>Current Status:</strong> The pipeline flow diagram below shows the current configuration's components and their real-time metrics. If "Current Config: Not Available" is shown, the agent has no configuration yet.
          </div>
        </div>
        
        {/* Fleet Overview */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24
        }}>
          <div style={{
            padding: 16,
            background: '#EFF6FF',
            borderRadius: 6,
            border: '1px solid #BFDBFE'
          }}>
            <div style={{ fontSize: 12, color: '#1E40AF', marginBottom: 4, fontWeight: 600 }}>Total Agents</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1E40AF' }}>{totalAgents}</div>
          </div>
          <div style={{
            padding: 16,
            background: '#D1FAE5',
            borderRadius: 6,
            border: '1px solid #86EFAC'
          }}>
            <div style={{ fontSize: 12, color: '#065F46', marginBottom: 4, fontWeight: 600 }}>Online</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#065F46' }}>{onlineAgents.length}</div>
            <div style={{ fontSize: 11, color: '#059669', marginTop: 4 }}>
              {totalAgents > 0 ? Math.round((onlineAgents.length / totalAgents) * 100) : 0}% availability
            </div>
          </div>
          <div style={{
            padding: 16,
            background: '#FEE2E2',
            borderRadius: 6,
            border: '1px solid #FECACA'
          }}>
            <div style={{ fontSize: 12, color: '#991B1B', marginBottom: 4, fontWeight: 600 }}>Offline</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#991B1B' }}>{totalAgents - onlineAgents.length}</div>
          </div>
        </div>

        {/* Agent Selector - Hierarchical Bridge/Collector Structure */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
            Select Agent to Monitor
          </label>
          {bridges.length > 0 && (
            <div style={{
              padding: '12px 16px',
              background: '#FEF3C7',
              border: '1px solid #FCD34D',
              borderRadius: 6,
              marginBottom: 12,
              fontSize: 12,
              color: '#92400E'
            }}>
              ⚠️ <strong>Note:</strong> Bridges are management agents and cannot be monitored. Only collectors (shown under bridges) can be monitored for pipelines and metrics.
            </div>
          )}
          {bridges.length > 0 ? (
            <div style={{ border: '1px solid #D1D5DB', borderRadius: 6, background: 'white', maxHeight: '400px', overflowY: 'auto' }}>
              {bridges.map(bridge => {
                const bridgeCollectors = bridge.collectors || [];
                const isExpanded = expandedGroups.has(`monitor-${bridge.agentUid}`);
                return (
                  <div key={bridge.agentUid} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    {/* Bridge Option - NOT selectable, only expandable */}
                    <div
                      onClick={() => {
                        const newExpanded = new Set(expandedGroups);
                        if (isExpanded) {
                          newExpanded.delete(`monitor-${bridge.agentUid}`);
                        } else {
                          newExpanded.add(`monitor-${bridge.agentUid}`);
                        }
                        setExpandedGroups(newExpanded);
                      }}
                      style={{
                        padding: '12px 16px',
                        background: isExpanded ? '#F3F4F6' : 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        borderLeft: '2px solid #E5E7EB'
                      }}
                      onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#F9FAFB';
                      }}
                      onMouseLeave={(e) => {
                          e.currentTarget.style.background = isExpanded ? '#F3F4F6' : 'white';
                      }}
                    >
                      <div style={{ fontSize: 12, color: '#6B7280', width: 20 }}>
                        {bridgeCollectors.length > 0 ? (isExpanded ? '▼' : '▶') : ''}
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, color: '#6B7280', fontSize: 12 }}>{bridge.name}</span>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>(Bridge - Management Agent)</span>
                        {bridge.namespace && (
                          <span style={{ fontSize: 10, padding: '2px 6px', background: '#EFF6FF', color: '#1E40AF', borderRadius: 3 }}>
                            ns: {bridge.namespace}
                          </span>
                        )}
                        {bridge.cluster && (
                          <span style={{ fontSize: 10, padding: '2px 6px', background: '#F0FDF4', color: '#166534', borderRadius: 3 }}>
                            cluster: {bridge.cluster}
                          </span>
                        )}
                        {getStatusBadge(bridge.status)}
                        <span style={{ fontSize: 11, color: '#6B7280' }}>
                          {bridgeCollectors.length} collector{bridgeCollectors.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    
                    {/* Collectors (nested) */}
                    {isExpanded && bridgeCollectors.map(collector => (
                      <div
                        key={collector.agentUid}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAgentUID(collector.agentUid);
                        }}
                        style={{
                          padding: '10px 16px 10px 48px',
                          background: selectedAgentUID === collector.agentUid ? '#DBEAFE' : '#FAFBFC',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          borderLeft: selectedAgentUID === collector.agentUid ? '4px solid #3B82F6' : 'none',
                          borderTop: '1px solid #E5E7EB'
                        }}
                        onMouseEnter={(e) => {
                          if (selectedAgentUID !== collector.agentUid) {
                            e.currentTarget.style.background = '#F9FAFB';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedAgentUID !== collector.agentUid) {
                            e.currentTarget.style.background = '#FAFBFC';
                          }
                        }}
                      >
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 500, color: '#111827' }}>{collector.name}</span>
                          <span style={{ fontSize: 11, color: '#6B7280' }}>(Collector)</span>
                          {collector.labels?.['k8s.namespace'] && (
                            <span style={{ fontSize: 10, padding: '2px 6px', background: '#EFF6FF', color: '#1E40AF', borderRadius: 3 }}>
                              ns: {collector.labels['k8s.namespace']}
                            </span>
                          )}
                          {collector.labels?.['k8s.crd_name'] && (
                            <span style={{ fontSize: 10, padding: '2px 6px', background: '#FEF3C7', color: '#92400E', borderRadius: 3 }}>
                              crd: {collector.labels['k8s.crd_name']}
                            </span>
                          )}
                          {collector.labels?.['k8s.cluster'] && (
                            <span style={{ fontSize: 10, padding: '2px 6px', background: '#F0FDF4', color: '#166534', borderRadius: 3 }}>
                              cluster: {collector.labels['k8s.cluster']}
                            </span>
                          )}
                          {getStatusBadge(collector.status)}
                          {collector.version && (
                            <span style={{ fontSize: 11, color: '#6B7280' }}>v{collector.version}</span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAgentUID(collector.agentUid);
                          }}
                          style={{
                            padding: '4px 12px',
                            background: selectedAgentUID === collector.agentUid ? '#3B82F6' : '#E5E7EB',
                            color: selectedAgentUID === collector.agentUid ? 'white' : '#374151',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 11,
                            fontWeight: 500
                          }}
                        >
                          {selectedAgentUID === collector.agentUid ? '✓ Selected' : 'Select'}
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
              
              {/* Standalone agents (not managed by bridges) */}
              {agents.filter(a => {
                const isBridge = bridges.some(b => b.agentUid === a.agentUid);
                const isBridgeCollector = bridges.some(b => b.collectors.some(c => c.agentUid === a.agentUid));
                return !isBridge && !isBridgeCollector;
              }).length > 0 && (
                <>
                  <div style={{ padding: '12px 16px', background: '#F9FAFB', borderTop: '2px solid #E5E7EB', fontWeight: 600, fontSize: 12, color: '#6B7280' }}>
                    Standalone Agents
                  </div>
                  {agents.filter(a => {
                    const isBridge = bridges.some(b => b.agentUid === a.agentUid);
                    const isBridgeCollector = bridges.some(b => b.collectors.some(c => c.agentUid === a.agentUid));
                    return !isBridge && !isBridgeCollector;
                  }).map(agent => (
                    <div
                      key={agent.agentUid}
                      onClick={() => setSelectedAgentUID(agent.agentUid)}
                      style={{
                        padding: '12px 16px',
                        background: selectedAgentUID === agent.agentUid ? '#DBEAFE' : 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderLeft: selectedAgentUID === agent.agentUid ? '4px solid #3B82F6' : 'none',
                        borderTop: '1px solid #E5E7EB'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span>{agent.name || agent.agentUid}</span>
                        {getStatusBadge(agent.status)}
                        {agent.version && <span style={{ fontSize: 11, color: '#6B7280' }}>v{agent.version}</span>}
                        {agent.labels && Object.keys(agent.labels).length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {Object.entries(agent.labels).slice(0, 3).map(([key, value]) => (
                              <span key={key} style={{ fontSize: 10, padding: '2px 6px', background: '#F3F4F6', color: '#374151', borderRadius: 3 }}>
                                {key}: {value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAgentUID(agent.agentUid);
                        }}
                        style={{
                          padding: '4px 12px',
                          background: selectedAgentUID === agent.agentUid ? '#3B82F6' : '#E5E7EB',
                          color: selectedAgentUID === agent.agentUid ? 'white' : '#374151',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 11
                        }}
                      >
                        {selectedAgentUID === agent.agentUid ? '✓ Selected' : 'Select'}
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            <select
              value={selectedAgentUID}
              onChange={(e) => setSelectedAgentUID(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid #D1D5DB',
                fontSize: 14,
                background: 'white'
              }}
            >
              <option value="">-- Select an agent --</option>
              {agents.map(a => (
                <option key={a.agentUid} value={a.agentUid}>
                  {a.name || a.agentUid} ({a.status}) {a.labels && Object.keys(a.labels).length > 0 && `[${Object.entries(a.labels).map(([k, v]) => `${k}=${v}`).join(', ')}]`}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Monitoring Data */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>
            Loading monitoring data...
          </div>
        )}
            {!loading && selectedAgentUID && monitoringData && (
              <div style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                boxSizing: 'border-box'
              }}>
                {/* Health Status - Only show if we have health data */}
                {monitoringData.health && monitoringData.health.current && monitoringData.health.current.healthy !== undefined && (
                  <div style={{
                    padding: 16,
                    background: monitoringData.health.current.healthy === true ? '#D1FAE5' : '#FEE2E2',
                    borderRadius: 6,
                    border: `1px solid ${monitoringData.health.current.healthy === true ? '#86EFAC' : '#FECACA'}`
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
                      🏥 Agent Health Status
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Status</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: monitoringData.health.current.healthy === true ? '#065F46' : '#991B1B' }}>
                          {monitoringData.health.current.healthy === true ? '✓ Healthy' : '✗ Unhealthy'}
                        </div>
                      </div>
                      {monitoringData.health.current.last_error && (
                        <div>
                          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Last Error</div>
                          <div style={{ fontSize: 12, color: '#991B1B', fontFamily: 'monospace' }}>
                            {monitoringData.health.current.last_error}
                          </div>
                        </div>
                      )}
                      {monitoringData.health.current.status_message && (
                        <div>
                          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Status Message</div>
                          <div style={{ fontSize: 12, color: '#111827' }}>
                            {monitoringData.health.current.status_message}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Health Status Placeholder - Show when agent is online but no health data yet */}
                {monitoringData.health && (!monitoringData.health.current || monitoringData.health.current.healthy === undefined) && (monitoringData.agent?.agent?.status || monitoringData.agent?.status) === 'online' && (
                  <div style={{
                    padding: 16,
                    background: '#FEF3C7',
                    borderRadius: 6,
                    border: '1px solid #FCD34D'
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
                      🏥 Agent Health Status
                    </div>
                    <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
                      {supportsHealthReports
                        ? 'Health data has not been reported yet. The agent might need a few moments after connecting before it emits OpAMP health messages.'
                        : 'This agent reported reports_health = false, so the OpAMP server cannot display health data for it.'}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 6 }}>
                      <a href="https://opentelemetry.io/docs/specs/opamp/protocol/#health-reporting" target="_blank" rel="noopener noreferrer" style={{ color: '#B45309', textDecoration: 'underline' }}>
                        Learn how OpAMP health reporting works
                      </a>
                    </div>
                  </div>
                )}

                {/* Pipeline Statuses */}
                {monitoringData.pipelines && monitoringData.pipelines.length > 0 && (
                  <div style={{
                    padding: 16,
                    background: '#F9FAFB',
                    borderRadius: 6,
                    border: '1px solid #E5E7EB'
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                      🔄 Pipeline Statuses
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
                      {monitoringData.pipelines.map((pipeline: any, idx: number) => (
                        <div key={idx} style={{
                          padding: 12,
                          background: 'white',
                          borderRadius: 4,
                          border: `1px solid ${pipeline.status === 'healthy' ? '#86EFAC' : pipeline.status === 'degraded' ? '#FCD34D' : '#FECACA'}`
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{pipeline.name}</div>
                            <div style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: pipeline.status === 'healthy' ? '#D1FAE5' : pipeline.status === 'degraded' ? '#FEF3C7' : '#FEE2E2',
                              color: pipeline.status === 'healthy' ? '#065F46' : pipeline.status === 'degraded' ? '#92400E' : '#991B1B',
                              fontWeight: 600
                            }}>
                              {pipeline.status}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Type: {pipeline.type}</div>
                          {pipeline.error_message && (
                            <div style={{ fontSize: 11, color: '#991B1B', marginTop: 4, fontFamily: 'monospace' }}>
                              Error: {pipeline.error_message}
                            </div>
                          )}
                          <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4 }}>
                            Updated: {pipeline.last_updated ? new Date(pipeline.last_updated).toLocaleString() : 'Never'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Collector Logs */}
                {monitoringData.telemetry && (
                  <div style={{
                    padding: 16,
                    background: '#F9FAFB',
                    borderRadius: 6,
                    border: '1px solid #E5E7EB'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                        📜 Collector Telemetry Logs
                      </div>
                    </div>
                    {telemetryLogs.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                        {telemetryLogs.map((entry: any, idx: number) => (
                          <div key={`telemetry-log-${idx}`} style={{ padding: 10, background: 'white', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginBottom: 4 }}>
                              <span style={{ fontWeight: 600, color: '#0F172A' }}>{entry.level?.toUpperCase() || entry.type || 'log'}</span>
                              <span>{entry.reported_at ? new Date(entry.reported_at).toLocaleString() : ''}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#111827', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {entry.message || entry.description || entry.error || JSON.stringify(entry.data || entry)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6 }}>
                        {supportsOwnLogs
                          ? 'No logs have been reported through OpAMP telemetry yet.'
                          : 'This agent reported reports_own_logs = false, so it will not stream logs through OpAMP. Use your platform (e.g., kubectl logs) to inspect collector logs.'}
                      </div>
                    )}
                  </div>
                )}

                {/* Telemetry Data - Metrics, Logs, Traces - Full Width */}
                {monitoringData.telemetry && monitoringData.telemetry.length > 0 && (
                  <div style={{
                    width: '100%',
                    padding: 16,
                    background: '#F9FAFB',
                    borderRadius: 6,
                    border: '1px solid #E5E7EB',
                    marginBottom: 16
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                      📊 Agent Telemetry Data
                    </div>
                    <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>
                      Historical telemetry data received from the agent (metrics, logs, traces)
                    </div>
                    
                    {/* Group by type for better organization */}
                    {(() => {
                      const grouped = {
                        metrics: monitoringData.telemetry.filter((t: any) => t.type === 'metrics'),
                        logs: monitoringData.telemetry.filter((t: any) => t.type === 'logs'),
                        traces: monitoringData.telemetry.filter((t: any) => t.type === 'traces'),
                        other: monitoringData.telemetry.filter((t: any) => !['metrics', 'logs', 'traces'].includes(t.type))
                      };
                      
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
                          {/* Metrics Section */}
                          {grouped.metrics.length > 0 && (
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#1E40AF', marginBottom: 8 }}>
                                📈 Metrics ({grouped.metrics.length})
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                                {grouped.metrics.map((tel: any, idx: number) => (
                                  <div key={`metrics-${idx}`} style={{
                                    padding: 12,
                                    background: 'white',
                                    borderRadius: 4,
                                    border: '1px solid #E5E7EB',
                                    fontSize: 12
                                  }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                      <span style={{ fontSize: 10, color: '#9CA3AF' }}>
                                        {tel.reported_at ? new Date(tel.reported_at).toLocaleString() : 'Unknown time'}
                                      </span>
                                    </div>
                                    {tel.data && (
                                      <div style={{
                                        background: '#EFF6FF',
                                        padding: 8,
                                        borderRadius: 4,
                                        fontFamily: 'monospace',
                                        fontSize: 11,
                                        maxHeight: 150,
                                        overflowY: 'auto'
                                      }}>
                                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                          {JSON.stringify(tel.data, null, 2)}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Logs Section */}
                          {grouped.logs.length > 0 && (
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#92400E', marginBottom: 8 }}>
                                📋 Logs ({grouped.logs.length})
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                                {grouped.logs.map((tel: any, idx: number) => (
                                  <div key={`logs-${idx}`} style={{
                                    padding: 12,
                                    background: 'white',
                                    borderRadius: 4,
                                    border: '1px solid #FCD34D',
                                    fontSize: 12
                                  }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                      <span style={{ fontSize: 10, color: '#9CA3AF' }}>
                                        {tel.reported_at ? new Date(tel.reported_at).toLocaleString() : 'Unknown time'}
                                      </span>
                                    </div>
                                    {tel.data && (
                                      <div style={{
                                        background: '#FEF3C7',
                                        padding: 8,
                                        borderRadius: 4,
                                        fontFamily: 'monospace',
                                        fontSize: 11,
                                        maxHeight: 200,
                                        overflowY: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word'
                                      }}>
                                        {typeof tel.data === 'string' ? tel.data : JSON.stringify(tel.data, null, 2)}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Traces Section */}
                          {grouped.traces.length > 0 && (
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#7C3AED', marginBottom: 8 }}>
                                🔍 Traces ({grouped.traces.length})
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                                {grouped.traces.map((tel: any, idx: number) => (
                                  <div key={`traces-${idx}`} style={{
                                    padding: 12,
                                    background: 'white',
                                    borderRadius: 4,
                                    border: '1px solid #E5E7EB',
                                    fontSize: 12
                                  }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                      <span style={{ fontSize: 10, color: '#9CA3AF' }}>
                                        {tel.reported_at ? new Date(tel.reported_at).toLocaleString() : 'Unknown time'}
                                      </span>
                                    </div>
                                    {tel.data && (
                                      <div style={{
                                        background: '#F3E8FF',
                                        padding: 8,
                                        borderRadius: 4,
                                        fontFamily: 'monospace',
                                        fontSize: 11,
                                        maxHeight: 150,
                                        overflowY: 'auto'
                                      }}>
                                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                          {JSON.stringify(tel.data, null, 2)}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Other/Unknown types */}
                          {grouped.other.length > 0 && (
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>
                                Other ({grouped.other.length})
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                                {grouped.other.map((tel: any, idx: number) => (
                                  <div key={`other-${idx}`} style={{
                                    padding: 12,
                                    background: 'white',
                                    borderRadius: 4,
                                    border: '1px solid #E5E7EB',
                                    fontSize: 12
                                  }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                      <div style={{
                                        fontSize: 11,
                                        padding: '4px 8px',
                                        borderRadius: 4,
                                        background: '#F3F4F6',
                                        color: '#6B7280',
                                        fontWeight: 600,
                                        textTransform: 'uppercase'
                                      }}>
                                        {tel.type || 'unknown'}
                                      </div>
                                      <span style={{ fontSize: 10, color: '#9CA3AF' }}>
                                        {tel.reported_at ? new Date(tel.reported_at).toLocaleString() : 'Unknown time'}
                                      </span>
                                    </div>
                                    {tel.data && (
                                      <div style={{
                                        background: '#F9FAFB',
                                        padding: 8,
                                        borderRadius: 4,
                                        fontFamily: 'monospace',
                                        fontSize: 11,
                                        maxHeight: 150,
                                        overflowY: 'auto'
                                      }}>
                                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                          {JSON.stringify(tel.data, null, 2)}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Status, Activity, and Config cards with full-width pipeline */}
                <div style={{
                  width: '100%',
                    display: 'flex', 
                    flexDirection: 'column', 
                  gap: 20
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                    gap: 20,
                    width: '100%',
                    alignItems: 'stretch'
                  }}>
                    {/* Agent Status */}
                    <div style={{
                      padding: 16,
                      background: '#F9FAFB',
                      borderRadius: 6,
                      border: '1px solid #E5E7EB',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                      Agent Status
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Connection Status</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {(() => {
                            const status = monitoringData.agent?.agent?.status || monitoringData.agent?.status;
                            if (status === 'online') {
                              return (
                                <>
                                  <span style={{ 
                                    display: 'inline-block', 
                                    width: 8, 
                                    height: 8, 
                                    borderRadius: '50%', 
                                    background: '#10B981' 
                                  }}></span>
                                  <span>Online</span>
                                </>
                              );
                            } else if (status === 'degraded') {
                              return (
                                <>
                                  <span style={{ 
                                    display: 'inline-block', 
                                    width: 8, 
                                    height: 8, 
                                    borderRadius: '50%', 
                                    background: '#F59E0B' 
                                  }}></span>
                                  <span>Degraded (Unhealthy)</span>
                                </>
                              );
                            } else if (status === 'offline') {
                              return (
                                <>
                                  <span style={{ 
                                    display: 'inline-block', 
                                    width: 8, 
                                    height: 8, 
                                    borderRadius: '50%', 
                                    background: '#EF4444' 
                                  }}></span>
                                  <span>Offline</span>
                                </>
                              );
                            } else {
                              return (
                                <>
                                  <span style={{ 
                                    display: 'inline-block', 
                                    width: 8, 
                                    height: 8, 
                                    borderRadius: '50%', 
                                    background: '#9CA3AF' 
                                  }}></span>
                                  <span>Unknown</span>
                                </>
                              );
                            }
                          })()}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Agent Version</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', fontFamily: 'monospace' }}>
                          {((monitoringData.agent?.agent?.version || monitoringData.agent?.version) && (monitoringData.agent?.agent?.version || monitoringData.agent?.version) !== 'unknown') ? (monitoringData.agent?.agent?.version || monitoringData.agent?.version) : 'Not reported'}
                        </div>
                      </div>
                      {(monitoringData.agent?.agent?.lastSeen || monitoringData.agent?.lastSeen) && (
                        <div>
                          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Last Seen</div>
                          <div style={{ fontSize: 12, color: '#111827' }}>
                            {new Date(monitoringData.agent?.agent?.lastSeen || monitoringData.agent?.lastSeen).toLocaleString()}
                          </div>
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Current Config</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: hasCurrentConfigLoaded ? '#10B981' : '#EF4444' }}>
                          {hasCurrentConfigLoaded ? '✓ Loaded' : '✗ Not Available'}
                        </div>
                      </div>
                      {resolvedAgentCaps && Object.keys(resolvedAgentCaps).length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>OpAMP Capabilities</div>
                          <CapabilityBadges capabilities={resolvedAgentCaps} limit={4} />
                    </div>
                      )}
                    </div>
                  </div>

                    {/* Recent Activity */}
                    <div style={{
                      padding: 16,
                      background: '#F9FAFB',
                      borderRadius: 6,
                      border: '1px solid #E5E7EB',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                        Recent Activity
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                        {monitoringData.recentActivity.length > 0 ? (
                          monitoringData.recentActivity.map((act: any, idx: number) => (
                            <div key={idx} style={{
                              padding: 10,
                              background: 'white',
                              borderRadius: 4,
                              border: '1px solid #E5E7EB',
                              fontSize: 12
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontWeight: 600, color: '#111827' }}>{act.type}</span>
                                <span style={{ color: '#9CA3AF', fontSize: 10 }}>
                                  {act.performedAt ? new Date(act.performedAt).toLocaleString() : ''}
                                </span>
                              </div>
                              <div style={{ color: '#6B7280', fontSize: 11 }}>
                                {act.description || act.type}
                              </div>
                              {act.performedBy && (
                                <div style={{ color: '#9CA3AF', fontSize: 10, marginTop: 4 }}>
                                  by {act.performedBy}
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center', padding: 20 }}>
                            No recent activity
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Config Info */}
                    {hasCurrentConfigLoaded && (
                      <div style={{
                        padding: 16,
                        background: '#F9FAFB',
                        borderRadius: 6,
                        border: '1px solid #E5E7EB',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        minWidth: 0
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                          Config Snapshot
                        </div>
                        <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>
                          Currently active configuration returned by the agent. Use this to compare against generated configs or troubleshoot issues.
                        </div>
                        <div style={{
                          borderRadius: 4,
                          border: '1px solid #E5E7EB',
                          background: '#FFFFFF',
                          maxHeight: 320,
                          overflowY: 'auto',
                          overflowX: 'hidden',
                          width: '100%',
                          maxWidth: '100%',
                          boxSizing: 'border-box',
                          position: 'relative',
                          flex: '1 1 auto',
                          minHeight: 0
                        }}>
                          <pre style={{
                            margin: 0,
                            padding: 8,
                            fontSize: 12,
                            fontFamily: 'monospace',
                            color: '#1F2937',
                            backgroundColor: '#FFFFFF',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            overflowWrap: 'break-word',
                            lineHeight: '1.5',
                            display: 'block',
                            width: '100%',
                            maxWidth: '100%',
                            overflow: 'hidden'
                          }}>
                            {pipelineConfigString || 'No config'}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pipeline Flow Diagram - spans the full width below the cards */}
                  {hasPipelineDiagramData ? (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
                        Pipeline Monitoring
                      </div>
                      <div style={{
                        fontSize: 12,
                        color: '#4B5563',
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: 8,
                        padding: 12,
                        lineHeight: 1.5,
                      }}>
                        Native OpAMP bridge/agent telemetry (reports_own_metrics) is not yet available for discovered collectors.
                        Until upstream support lands, these toggles let you pull CPU, memory, bandwidth, and logs via Grafana data sources instead.
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                        <TelemetryToggleCard
                          title="Metrics overlays"
                          description="Visualize per-pipeline CPU, memory, and throughput via Prometheus or Mimir."
                          enabled={metricsSettings.enabled}
                          disabled={telemetryLoading}
                          datasourceLabel={metricsSettings.datasourceUid ? `Datasource: ${telemetryDatasourceHints.metrics || metricsSettings.datasourceUid}` : 'Datasource: not configured'}
                          footerNote="Applies to both the pipeline cards and the per-stage throughput chips."
                          onToggle={() => onToggleMetrics(!metricsSettings.enabled)}
                          onConfigure={() => onConfigureTelemetry('metrics')}
                        />
                        <TelemetryToggleCard
                          title="Log snapshots"
                          description="Use a Loki query template to inspect recent collector logs."
                          enabled={logsSettings.enabled}
                          disabled={telemetryLoading}
                          datasourceLabel={logsSettings.datasourceUid ? `Datasource: ${telemetryDatasourceHints.logs || logsSettings.datasourceUid}` : 'Datasource: not configured'}
                          footerNote="Fetches up to 50 log lines from the configured Loki datasource."
                          onToggle={() => onToggleLogs(!logsSettings.enabled)}
                          onConfigure={() => onConfigureTelemetry('logs')}
                        />
                      </div>
                  <PipelineFlowDiagram 
                        config={pipelineConfigString}
                        pipelines={monitoringData.pipelines || []}
                        telemetry={monitoringData.telemetry || []}
                        agentName={monitoringData?.agent?.name || monitoringData?.agent?.agentUid}
                        agentUid={monitoringData?.agent?.agentUid}
                        orgName={monitoringData?.agent?.orgName}
                        metricsSettings={metricsSettings}
                        onConfigureMetrics={() => onConfigureTelemetry('metrics')}
                      />
                      <div style={{ marginTop: 16 }}>
                        <LogsPanelView
                          settings={logsSettings}
                          enabled={logsSettings.enabled}
                          agentUid={monitoringData?.agent?.agentUid}
                          agentName={monitoringData?.agent?.name}
                          orgName={monitoringData?.agent?.orgName}
                          onConfigure={() => onConfigureTelemetry('logs')}
                          backendSrv={backendSrv}
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      width: '100%',
                      padding: 16,
                      background: '#FEF3C7',
                      borderRadius: 8,
                      border: '1px dashed #F59E0B',
                      color: '#92400E',
                      fontSize: 13
                    }}>
                      No pipeline configuration has been reported by this agent yet. Connect the agent or push a configuration to visualize pipelines here.
                    </div>
                  )}
                </div>

              </div>
            )}

        {!loading && !selectedAgentUID && (
          <div style={{
            padding: 40,
            textAlign: 'center',
            color: '#6B7280',
            background: '#F9FAFB',
            borderRadius: 6
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Select an Agent</div>
            <div style={{ fontSize: 14 }}>
              Choose an agent from the dropdown above to view monitoring data and metrics.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
