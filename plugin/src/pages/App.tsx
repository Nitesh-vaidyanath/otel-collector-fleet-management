import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { getBackendSrv } from '@grafana/runtime';
import { ConfigGenerator } from './components/ConfigGenerator';
import { TelemetryConfigDrawer } from './components/TelemetryConfigDrawer';
import { MonitoringSection } from './components/MonitoringSection';
import { Header } from './components/Header';
import { Tabs } from './components/Tabs';
import {
  PLUGIN_ID,
  DEFAULT_OPAMP_WS,
  TELEMETRY_SETTINGS_ENDPOINT,
  LOGS_QUERY_PLACEHOLDER,
  capabilityOrder,
} from './constants';
import type {
  Agent,
  Bridge,
  Tab,
  FleetTelemetrySettings,
  MetricsTelemetryConfig,
  LogsTelemetryConfig,
  ComponentCategory,
  OpampSettingsResponse,
} from './types';
import {
  detectRuntimeMode,
  detectGrafanaTransport,
} from './utils/runtime';
import {
  buildOpampConnectionUrl,
} from './utils/opamp';
import {
  getDefaultTelemetrySettingsState,
  normalizeTelemetrySettingsState,
  cloneStageQueries,
} from './utils/telemetry';
import {
  createBackendSrv,
  setTenantHeaderValue,
} from './utils/api';
import {
  normalizeTelemetryItems,
  getStatusBadge,
} from './utils/helpers';
import {
  CapabilityBadges,
  isCapabilityEnabled,
  capabilityMeta,
} from './utils/capabilities';
import {
  formatComponentLabel,
  cloneSampleConfig,
  mergeComponentTypeLists,
  builtinReceiverTemplates,
  builtinProcessorTemplates,
  builtinExporterTemplates,
  inferComponentType,
} from './utils/components';

const rawBackendSrv = getBackendSrv();


// Runtime detection and backend service setup
const runtimeMode = detectRuntimeMode();
const isRunningInGrafana = runtimeMode === 'grafana';
const grafanaTransport = detectGrafanaTransport(isRunningInGrafana);
const backendSrv = createBackendSrv(isRunningInGrafana, grafanaTransport);

export const App = () => {
  const [activeTab, setActiveTab] = useState<Tab>('collectors');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabelFilter, setSelectedLabelFilter] = useState<{key: string, value: string} | null>(null);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'capabilities' | 'activity'>('overview');
  const [detailPanelMonitoringData, setDetailPanelMonitoringData] = useState<any>(null);
  const [loadingDetailMonitoring, setLoadingDetailMonitoring] = useState(false);
  const [groupByDeploymentType, setGroupByDeploymentType] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [bridgeCapabilitySheet, setBridgeCapabilitySheet] = useState<{ bridge: Bridge | null; open: boolean }>({
    bridge: null,
    open: false,
  });
  const closeBridgeCapabilitySheet = () => setBridgeCapabilitySheet({ bridge: null, open: false });
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [currentOrgName, setCurrentOrgName] = useState<string>('');
  const [agentActivityLog, setAgentActivityLog] = useState<any[]>([]);
  const [grafanaOrgName, setGrafanaOrgName] = useState<string>('');
  const [opampConnectionUrl, setOpampConnectionUrl] = useState<string>(DEFAULT_OPAMP_WS);
  const [telemetrySettings, setTelemetrySettings] = useState<FleetTelemetrySettings>(getDefaultTelemetrySettingsState());
  const [telemetryLoading, setTelemetryLoading] = useState<boolean>(true);
  const [telemetrySaving, setTelemetrySaving] = useState<boolean>(false);
  const [telemetryDrawer, setTelemetryDrawer] = useState<{ open: boolean; mode: 'metrics' | 'logs' }>({ open: false, mode: 'metrics' });
  const [draftMetricsConfig, setDraftMetricsConfig] = useState<MetricsTelemetryConfig>(() => getDefaultTelemetrySettingsState().metrics);
  const [draftLogsConfig, setDraftLogsConfig] = useState<LogsTelemetryConfig>(() => getDefaultTelemetrySettingsState().logs);
  const [telemetryDatasourceHints, setTelemetryDatasourceHints] = useState<{ metrics?: string; logs?: string }>({});

  useEffect(() => {
    let cancelled = false;
    const resolve = async (uid: string | null | undefined, key: 'metrics' | 'logs') => {
      if (!uid || uid.trim() === '') {
        if (!cancelled) {
          setTelemetryDatasourceHints((prev) => ({ ...prev, [key]: undefined }));
        }
        return;
      }
      try {
        const ds = await backendSrv.get<{ name?: string }>(`/api/datasources/uid/${encodeURIComponent(uid)}`);
        if (!cancelled) {
          const label = typeof ds?.name === 'string' && ds.name.trim() !== '' ? ds.name : uid;
          setTelemetryDatasourceHints((prev) => ({ ...prev, [key]: label }));
        }
      } catch (err) {
        console.error('Failed to resolve datasource name', err);
        if (!cancelled) {
          setTelemetryDatasourceHints((prev) => ({ ...prev, [key]: uid }));
        }
      }
    };

    resolve(telemetrySettings.metrics.datasourceUid, 'metrics');
    resolve(telemetrySettings.logs.datasourceUid, 'logs');

    return () => {
      cancelled = true;
    };
  }, [backendSrv, telemetrySettings.logs.datasourceUid, telemetrySettings.metrics.datasourceUid]);

  const openTelemetryConfigurator = useCallback((mode: 'metrics' | 'logs') => {
    setTelemetryDrawer({ open: true, mode });
    setDraftMetricsConfig({
      ...telemetrySettings.metrics,
      queries: { ...telemetrySettings.metrics.queries },
      stageQueries: cloneStageQueries(telemetrySettings.metrics.stageQueries),
    });
    setDraftLogsConfig({ ...telemetrySettings.logs });
  }, [telemetrySettings]);

  const closeTelemetryConfigurator = useCallback(() => {
    setTelemetryDrawer((prev) => ({ ...prev, open: false }));
  }, []);

  const loadTelemetrySettings = useCallback(async () => {
    setTelemetryLoading(true);
    try {
      const response = await backendSrv.get<{ settings?: any }>(TELEMETRY_SETTINGS_ENDPOINT);
      if (response && typeof response === 'object' && response.settings) {
        setTelemetrySettings(normalizeTelemetrySettingsState(response.settings));
      } else {
        setTelemetrySettings(getDefaultTelemetrySettingsState());
      }
    } catch (err) {
      console.error('Failed to load telemetry settings', err);
      setTelemetrySettings(getDefaultTelemetrySettingsState());
    } finally {
      setTelemetryLoading(false);
    }
  }, []);

  const persistTelemetrySettings = useCallback(async (next: FleetTelemetrySettings) => {
    setTelemetrySettings(next);
    setTelemetrySaving(true);
    try {
      await backendSrv.post(TELEMETRY_SETTINGS_ENDPOINT, next);
    } catch (err) {
      console.error('Failed to save telemetry settings', err);
    } finally {
      setTelemetrySaving(false);
    }
  }, []);

  const handleTelemetryConfigSave = useCallback((mode: 'metrics' | 'logs') => {
    if (mode === 'metrics') {
      const next: FleetTelemetrySettings = {
        ...telemetrySettings,
        metrics: {
          ...draftMetricsConfig,
          enabled: true,
          datasourceUid: draftMetricsConfig.datasourceUid ? draftMetricsConfig.datasourceUid : null,
          queries: { ...draftMetricsConfig.queries },
          stageQueries: cloneStageQueries(draftMetricsConfig.stageQueries),
        },
      };
      persistTelemetrySettings(next);
    } else {
      const next: FleetTelemetrySettings = {
        ...telemetrySettings,
        logs: {
          ...draftLogsConfig,
          enabled: true,
          datasourceUid: draftLogsConfig.datasourceUid ? draftLogsConfig.datasourceUid : null,
          query: draftLogsConfig.query && draftLogsConfig.query.trim() !== '' ? draftLogsConfig.query : LOGS_QUERY_PLACEHOLDER,
        },
      };
      persistTelemetrySettings(next);
    }
    closeTelemetryConfigurator();
  }, [draftLogsConfig, draftMetricsConfig, closeTelemetryConfigurator, persistTelemetrySettings, telemetrySettings]);

  const handleMetricsToggle = useCallback((nextEnabled: boolean) => {
    const next: FleetTelemetrySettings = {
      ...telemetrySettings,
      metrics: {
        ...telemetrySettings.metrics,
        enabled: nextEnabled,
      },
    };
    persistTelemetrySettings(next);
    if (nextEnabled && (!telemetrySettings.metrics.datasourceUid || telemetrySettings.metrics.datasourceUid.trim() === '')) {
      openTelemetryConfigurator('metrics');
    }
  }, [openTelemetryConfigurator, persistTelemetrySettings, telemetrySettings]);

  const handleLogsToggle = useCallback((nextEnabled: boolean) => {
    const next: FleetTelemetrySettings = {
      ...telemetrySettings,
      logs: {
        ...telemetrySettings.logs,
        enabled: nextEnabled,
      },
    };
    persistTelemetrySettings(next);
    if (nextEnabled && (!telemetrySettings.logs.datasourceUid || telemetrySettings.logs.datasourceUid.trim() === '')) {
      openTelemetryConfigurator('logs');
    }
  }, [openTelemetryConfigurator, persistTelemetrySettings, telemetrySettings]);

  const [isAdmin, setIsAdmin] = useState(false);
  const [userContext, setUserContext] = useState<{ name: string; role: string; isAdmin: boolean }>({
    name: '',
    role: '',
    isAdmin: false,
  });
  const [collectorTotals, setCollectorTotals] = useState({
    direct: 0,
    directOnline: 0,
    managed: 0,
    managedOnline: 0,
    total: 0,
    online: 0,
  });
  const selectedAgentTenantName = useMemo(() => currentOrgName.trim(), [currentOrgName]);
  const displayUserName = useMemo(() => {
    const raw = (userContext.name || '').trim();
    if (!raw) {
      return 'unknown';
    }
    if (selectedOrgId && raw.endsWith(` ${selectedOrgId}`)) {
      const sliced = raw.slice(0, raw.length - (` ${selectedOrgId}`).length).trim();
      if (sliced) {
        return sliced;
      }
    }
    return raw;
  }, [userContext.name, selectedOrgId]);
  const displayOrgBadge = useMemo(() => {
    if (currentOrgName && selectedOrgId) {
      return `${currentOrgName} (#${selectedOrgId})`;
    }
    if (currentOrgName) {
      return currentOrgName;
    }
    if (selectedOrgId) {
      return `Org #${selectedOrgId}`;
    }
    return 'Organization unknown';
  }, [currentOrgName, selectedOrgId]);

  const handleDeleteBridge = async (bridgeUid: string, bridgeName: string) => {
    if (!window.confirm(`Are you sure you want to delete bridge "${bridgeName}"?\n\nThis will remove the bridge from the UI. Collectors managed by this bridge will be cleaned up automatically if they remain offline for 24 hours.`)) {
      return;
    }
    try {
      const url = `/api/plugins/otel-collector-agent-fleet-management/resources/bridges/${bridgeUid}/delete`;
      await backendSrv.post(url);
      // Refresh bridges list
      await fetchBridges();
      await fetchAgents();
    } catch (err: any) {
      alert(`Failed to delete bridge: ${err.message || 'Unknown error'}`);
    }
  };

  const fetchBridges = async () => {
    try {
      const response = await backendSrv.get('/api/plugins/otel-collector-agent-fleet-management/resources/bridges');
      console.log('DEBUG: Fetched bridges response:', { bridges: response.bridges, count: response.bridges?.length || 0 });
      if (response.bridges && response.bridges.length > 0) {
        response.bridges.forEach((bridge: Bridge, idx: number) => {
          console.log(`DEBUG: Bridge ${idx}:`, { 
            agentUid: bridge.agentUid?.substring(0, 8), 
            name: bridge.name, 
            collectorsCount: bridge.collectors?.length || 0,
            collectors: bridge.collectors?.map((c: any) => ({ uid: c.agentUid?.substring(0, 8), name: c.name }))
          });
        });
      }
      setBridges(response.bridges || []);
    } catch (err: any) {
      console.error('Failed to fetch bridges:', err);
      // Don't set error - bridges endpoint might not exist yet
    }
  };

  const fetchAgents = async () => {
    try {
      setError('');
      const response = await backendSrv.get('/api/plugins/otel-collector-agent-fleet-management/resources/agents');
      const incomingAgents = response.items || [];
      setAgents(incomingAgents);
      const directOnline = incomingAgents.filter((a: Agent) => a.status === 'online').length;
      const totals = response.totals || {};
      const backendDirectOnline = totals.directOnline ?? totals.directOnlline ?? directOnline;
      const backendManagedOnline = totals.managedOnline ?? 0;
      const mergedTotals = {
        direct: totals.directAgents ?? incomingAgents.length,
        directOnline: backendDirectOnline,
        managed: totals.managedCollectors ?? 0,
        managedOnline: backendManagedOnline,
        total: totals.totalCollectors ?? ((totals.directAgents ?? incomingAgents.length) + (totals.managedCollectors ?? 0)),
        online: totals.onlineCollectors ?? (backendDirectOnline + backendManagedOnline),
      };
      setCollectorTotals(mergedTotals);
      // Update admin status from response (refresh on each fetch)
      if (response.userRole) {
        const rawRole = response.userRole.role;
        const normalizedRole = (() => {
          if (typeof rawRole === 'string') {
            const lower = rawRole.toLowerCase();
            if (lower.includes('admin')) return 'Admin';
            if (lower.includes('editor')) return 'Editor';
            if (lower.includes('viewer')) return 'Viewer';
            return rawRole;
          }
          if (typeof rawRole === 'number') {
            if (rawRole === 2) return 'Admin';
            if (rawRole === 1) return 'Editor';
            return 'Viewer';
          }
          return response.userRole.isAdmin ? 'Admin' : 'Viewer';
        })();
        const inferredIsAdmin = response.userRole.isAdmin === true || normalizedRole === 'Admin';
        setIsAdmin(inferredIsAdmin);
        setUserContext(prev => ({
          name: response.userRole.userDisplayName || response.userRole.userName || prev.name,
          role: normalizedRole || prev.role,
          isAdmin: inferredIsAdmin,
        }));
      }
      const effectiveOrgId = typeof response.grafanaOrgId === 'number'
        ? response.grafanaOrgId
        : (typeof response.orgId === 'number' ? response.orgId : undefined);
      if (typeof effectiveOrgId === 'number') {
        setSelectedOrgId(effectiveOrgId);
      }
      if (response.grafanaOrgName || response.orgName) {
        setCurrentOrgName(response.grafanaOrgName || response.orgName);
      }
      // Also fetch bridges for hierarchical view
      await fetchBridges();
    } catch (err: any) {
      console.error('Failed to fetch agents:', err);
      setError(err.message || 'Failed to fetch agents');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadOpampSettings = useCallback(async () => {
    try {
      const response = await backendSrv.get<OpampSettingsResponse>('/settings');
      const derived = buildOpampConnectionUrl(response?.opampServerURL, response?.opampEndpoint);
      setOpampConnectionUrl(derived);
    } catch (err) {
      console.error('Failed to load OpAMP settings:', err);
    }
  }, []);

  const loadUserContext = useCallback(async () => {
    try {
      const response = await backendSrv.get('/user-role');
      if (response) {
        const displayName = response.userDisplayName || response.userName || 'unknown';
        const rawRole = response.role;
        const normalizedRole = (() => {
          if (typeof rawRole === 'string') {
            const lower = rawRole.toLowerCase();
            if (lower.includes('admin')) return 'Admin';
            if (lower.includes('editor')) return 'Editor';
            if (lower.includes('viewer')) return 'Viewer';
            return rawRole;
          }
          if (typeof rawRole === 'number') {
            if (rawRole === 2) return 'Admin';
            if (rawRole === 1) return 'Editor';
            return 'Viewer';
          }
          return response.isAdmin ? 'Admin' : 'Viewer';
        })();
        setUserContext({
          name: displayName,
          role: normalizedRole,
          isAdmin: response.isAdmin === true || response.isAdmin === 'true' || normalizedRole === 'Admin',
        });
        if (typeof response.grafanaOrgId === 'number') {
          setSelectedOrgId(response.grafanaOrgId);
        }
        if (response.grafanaOrgName) {
          setCurrentOrgName(response.grafanaOrgName);
        }
        setIsAdmin(response.isAdmin === true || normalizedRole === 'Admin');
      }
    } catch (err) {
      console.error('Failed to load user context:', err);
    }
  }, []);

  const loadGrafanaOrgContext = useCallback(async () => {
    try {
      const org = await rawBackendSrv.get('/api/org');
      const orgName = (org && org.name) ? String(org.name) : '';
      setGrafanaOrgName(orgName);
      setTenantHeaderValue(orgName);
    } catch (err) {
      console.error('Failed to load Grafana org context:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadGrafanaOrgContext();
      await loadUserContext();
      await loadTelemetrySettings();
      await fetchAgents();
    };
    init();
    loadOpampSettings();
    const interval = setInterval(fetchAgents, 10000);
    return () => clearInterval(interval);
  }, [loadGrafanaOrgContext, loadTelemetrySettings, loadUserContext, loadOpampSettings]);

  useEffect(() => {
    if (!currentOrgName && grafanaOrgName) {
      setCurrentOrgName(grafanaOrgName);
    }
  }, [grafanaOrgName, currentOrgName]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAgents();
  };

  const [pushingConfig, setPushingConfig] = useState<string | null>(null);

  const handlePushConfig = async (agentUID: string, config?: string, configId?: string) => {
    setPushingConfig(agentUID);
    try {
      setError('');
      // If no config provided, fetch latest approved config for this agent
      let configToPush = config;
      if (!configToPush || configToPush.trim() === '') {
        // Fetch latest approved config for this agent
        try {
          const configsResponse = await backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/configs?agent_uid=${agentUID}`);
          const approvedConfig = (configsResponse.items || []).find((c: any) => c.approvalStatus === 'approved');
          if (approvedConfig) {
            // Fetch full config
            const fullConfigResponse = await backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/configs/${approvedConfig.id}`);
            configToPush = fullConfigResponse.config || '';
            configId = fullConfigResponse.id;
          } else {
            alert('No approved configuration found for this agent. Please generate and approve a configuration first.');
            setPushingConfig(null);
            return;
          }
        } catch (err: any) {
          alert('Failed to fetch configuration: ' + (err.message || 'Unknown error'));
          setPushingConfig(null);
          return;
        }
      }
      
      if (!configToPush || configToPush.trim() === '') {
        alert('Please generate a configuration first in the Configurations tab');
        setPushingConfig(null);
        return;
      }
      
      const url = `/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/operations${configId ? `?config_id=${configId}` : ''}`;
      await backendSrv.post(url, { action: 'push-config', config: configToPush });
      alert('Configuration pushed successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to push config');
      alert('Failed to push config: ' + (err.message || 'Unknown error'));
    } finally {
      setPushingConfig(null);
    }
  };

  const [upgradingAgent, setUpgradingAgent] = useState<string | null>(null);

  const handleUpgrade = async (agentUID: string) => {
    const confirmUpgrade = window.confirm(
      '⚠️ Upgrading will restart this collector and update only the collector binary/image. Please review the release notes and ensure your operator/CRDs support the new version.\n\nContinue with the upgrade?'
    );
    if (!confirmUpgrade) {
      return;
    }
    setUpgradingAgent(agentUID);
    try {
      setError('');
      await backendSrv.post(
        `/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/operations`,
        { action: 'upgrade' }
      );
      alert('Upgrade command sent successfully! The agent will restart when ready.');
    } catch (err: any) {
      setError(err.message || 'Failed to upgrade agent');
      alert('Failed to upgrade agent: ' + (err.message || 'Unknown error'));
    } finally {
      setUpgradingAgent(null);
    }
  };

  // Load monitoring data for details panel when capabilities/activity tab is selected
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const shouldLoadDetails =
      showDetailsPanel && selectedAgent && (detailTab === 'capabilities' || detailTab === 'activity');

    if (shouldLoadDetails) {
      const loadDetailMonitoring = async (silent = false) => {
        if (!silent) {
      setLoadingDetailMonitoring(true);
        }
        try {
          const [telemetryResponse, healthResponse] = await Promise.all([
            backendSrv
              .get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${selectedAgent!.agentUid}/telemetry?limit=50`)
              .catch(() => ({ items: [] })),
            backendSrv
              .get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${selectedAgent!.agentUid}/health?limit=20`)
              .catch(() => ({ items: [], current: {} })),
          ]);
          setDetailPanelMonitoringData({
            telemetry: normalizeTelemetryItems(telemetryResponse.items),
            health: healthResponse,
          });
        } catch (err) {
          console.error('Failed to load detail monitoring data:', err);
          setDetailPanelMonitoringData({ telemetry: [], health: { items: [], current: {} } });
        } finally {
          if (!silent) {
          setLoadingDetailMonitoring(false);
          }
        }
      };

      loadDetailMonitoring(false);
      interval = setInterval(() => loadDetailMonitoring(true), 5000);
    } else {
      setDetailPanelMonitoringData(null);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [selectedAgent?.agentUid, detailTab, showDetailsPanel]);

  // Collect all unique labels for filtering
  const allLabels = new Map<string, Set<string>>();
  agents.forEach(agent => {
    if (agent.labels) {
      Object.entries(agent.labels).forEach(([key, value]) => {
        if (!allLabels.has(key)) {
          allLabels.set(key, new Set());
        }
        allLabels.get(key)!.add(value);
      });
    }
  });

  // Sort agents: online first, then by last seen (most recent first)
  const sortedAgents = [...agents].sort((a, b) => {
    // First sort by status (online > degraded > offline > unknown)
    const statusOrder: Record<string, number> = { online: 0, degraded: 1, offline: 2, unknown: 3 };
    const aOrder = statusOrder[a.status] ?? 3;
    const bOrder = statusOrder[b.status] ?? 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    // Then by last seen (most recent first)
    if (a.lastSeen && b.lastSeen) {
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
    }
    if (a.lastSeen) return -1;
    if (b.lastSeen) return 1;
    return 0;
  });

  const filteredAgents = sortedAgents.filter(a => {
    // Search query filter
    if (searchQuery && 
        !a.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !a.agentUid.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !Object.values(a.labels || {}).some(v => v.toLowerCase().includes(searchQuery.toLowerCase()))) {
      return false;
    }
    // Label filter
    if (selectedLabelFilter) {
      return a.labels && a.labels[selectedLabelFilter.key] === selectedLabelFilter.value;
    }
    return true;
  });

  // Group agents by deployment type
  const groupedAgents = groupByDeploymentType ? (() => {
    const groups: Record<string, Agent[]> = {};
    filteredAgents.forEach(agent => {
      const deploymentType = agent.labels?.['deployment.type'] || 
                            agent.labels?.['deployment-type'] ||
                            agent.labels?.['deployment_type'] ||
                            'unknown';
      if (!groups[deploymentType]) {
        groups[deploymentType] = [];
      }
      groups[deploymentType].push(agent);
    });
    return groups;
  })() : null;
  const derivedBridgeCount = bridges.reduce((sum, b) => sum + (b.collectors?.length || 0), 0);
  const derivedBridgeOnline = bridges.reduce((sum, b) => sum + (b.collectors?.filter((c: any) => c.status === 'online').length || 0), 0);
  const totalCollectorsDisplay = collectorTotals.total || (agents.length + derivedBridgeCount);
  const totalOnlineDisplay = collectorTotals.online || ((collectorTotals.directOnline || agents.filter(a => a.status === 'online').length) + (collectorTotals.managedOnline || derivedBridgeOnline));
  const totalOfflineDisplay = Math.max(totalCollectorsDisplay - totalOnlineDisplay, 0);
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#F9FAFB',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      <Header
        currentOrgName={currentOrgName}
        selectedOrgId={selectedOrgId}
        displayUserName={displayUserName}
        userContext={userContext}
        displayOrgBadge={displayOrgBadge}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />

      <Tabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        totalCollectorsDisplay={totalCollectorsDisplay}
      />

      {/* Content */}
      <div style={{ padding: 24, width: '100%', margin: '0', boxSizing: 'border-box' }}>
        {error && (
          <div style={{
            padding: 12,
            marginBottom: 16,
            background: '#FEE2E2',
            border: '1px solid #FECACA',
            borderRadius: 6,
            color: '#DC2626',
            fontSize: 14
          }}>
            {error}
          </div>
        )}

        {activeTab === 'collectors' && (
          <div>
            {/* Search, Labels Filter, and Stats */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              marginBottom: 24
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16
              }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
                  <input
                    type="text"
                    placeholder="Search collectors by name, UID, or label..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      border: '1px solid #D1D5DB',
                      borderRadius: 6,
                      fontSize: 14,
                      background: 'white'
                    }}
                  />
                  <span style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#9CA3AF'
                  }}>🔍</span>
                </div>
                {selectedLabelFilter && (
                  <button
                    onClick={() => setSelectedLabelFilter(null)}
                    style={{
                      padding: '8px 16px',
                      background: '#EF4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    ✗ Clear Label Filter: {selectedLabelFilter.key}={selectedLabelFilter.value}
                  </button>
                )}
              </div>
              
              {/* Label Filter Pills */}
              {allLabels.size > 0 && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  padding: 12,
                  background: '#F9FAFB',
                  borderRadius: 6,
                  border: '1px solid #E5E7EB'
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginRight: 8, alignSelf: 'center' }}>
                    Filter by Labels:
                  </div>
                  {Array.from(allLabels.entries()).map(([key, values]) => 
                    Array.from(values).map(value => (
                      <button
                        key={`${key}:${value}`}
                        onClick={() => setSelectedLabelFilter(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? null : { key, value })}
                        style={{
                          padding: '6px 12px',
                          background: selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? '#3B82F6' : 'white',
                          color: selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? 'white' : '#111827',
                          border: `1px solid ${selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? '#3B82F6' : '#D1D5DB'}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (!(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value)) {
                            e.currentTarget.style.background = '#F3F4F6';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value)) {
                            e.currentTarget.style.background = 'white';
                          }
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{key}:</span>
                        <span>{value}</span>
                        {selectedLabelFilter?.key === key && selectedLabelFilter?.value === value && (
                          <span style={{ fontSize: 10 }}>✓</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
              
              <div style={{
                display: 'flex',
                gap: 16,
                fontSize: 14,
                color: '#6B7280',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600, color: '#111827' }}>{totalCollectorsDisplay}</span> Total
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, color: '#10B981' }}>{totalOnlineDisplay}</span> Online
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, color: '#EF4444' }}>{totalOfflineDisplay}</span> Offline
                  </div>
                  {agents.length > 0 && (selectedOrgId || currentOrgName) && (
                    <div style={{ 
                      marginLeft: 16, 
                      paddingLeft: 16, 
                      borderLeft: '1px solid #E5E7EB',
                      fontSize: 12 
                    }}>
                      <span style={{ color: '#6B7280' }}>Viewing:</span>{' '}
                      <span style={{ fontWeight: 600, color: '#3B82F6' }}>
                        {currentOrgName || 'Tenant'}
                      </span>
                    </div>
                  )}
                </div>
                {filteredAgents.length > 0 && (
                  <button
                    onClick={() => setGroupByDeploymentType(!groupByDeploymentType)}
                    style={{
                      padding: '6px 12px',
                      background: groupByDeploymentType ? '#3B82F6' : '#F3F4F6',
                      color: groupByDeploymentType ? 'white' : '#6B7280',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 500
                    }}
                  >
                    {groupByDeploymentType ? '📁 Grouped by Type' : '📋 Flat List'}
                  </button>
                )}
              </div>
            </div>

            {/* Agent Cards */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 80, color: '#6B7280' }}>
                <div style={{ fontSize: 18, marginBottom: 8 }}>Loading collectors...</div>
                <div style={{ fontSize: 14 }}>Connecting to OpAMP server...</div>
              </div>
            ) : bridges.length === 0 && filteredAgents.length === 0 ? (
              <div style={{
                background: 'white',
                borderRadius: 8,
                border: '1px solid #E5E7EB',
                padding: 60,
                textAlign: 'center'
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
                  {selectedOrgId || currentOrgName
                    ? `No collectors found in ${currentOrgName || 'the selected tenant'}`
                    : 'No collectors found'}
                </div>
                <div style={{ fontSize: 14, color: '#6B7280', maxWidth: 500, margin: '0 auto' }}>
                  {searchQuery ? (
                    <>No collectors match your search. Try a different query.</>
                  ) : selectedOrgId ? (
                    <>
                      No agents are registered for this organization yet.
                      <br />
                      <br />
                      Connect your OpenTelemetry Collector agents via OpAMP to see them here.
                      <br />
                      Configure your agent to connect to:{' '}
                      <code style={{
                        background: '#F3F4F6',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 13,
                        fontFamily: 'monospace'
                      }}>{opampConnectionUrl}</code>
                      <br />
                      <br />
                      <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                        💡 Tip: Label your agents with <code style={{ background: '#F3F4F6', padding: '2px 6px', borderRadius: 3 }}>tenant.name</code> or <code style={{ background: '#F3F4F6', padding: '2px 6px', borderRadius: 3 }}>organization.name</code> so they automatically map to the right tenant, or fall back to numeric labels like <code style={{ background: '#F3F4F6', padding: '2px 6px', borderRadius: 3 }}>org_id</code>/<code style={{ background: '#F3F4F6', padding: '2px 6px', borderRadius: 3 }}>tenant.id</code>.
                      </span>
                    </>
                  ) : (
                    <>
                      Please select an organization from the dropdown above to view agents.
                      <br />
                      <br />
                      Or connect your OpenTelemetry Collector agents via OpAMP to see them here.
                      <br />
                      Configure your agent to connect to:{' '}
                      <code style={{
                        background: '#F3F4F6',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 13,
                        fontFamily: 'monospace'
                      }}>{opampConnectionUrl}</code>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div style={{
                background: 'white',
                borderRadius: 8,
                border: '1px solid #E5E7EB',
                overflow: 'hidden'
              }}>
                {/* Show hierarchical bridges view if bridges exist */}
                {bridges.length > 0 ? (
                  <>
                {/* Bridges Header */}
                <div style={{
                  padding: '16px',
                  background: '#F9FAFB',
                  borderBottom: '2px solid #E5E7EB',
                  fontWeight: 600,
                  fontSize: 14,
                  color: '#111827'
                }}>
                  OpAMP Bridges ({bridges.length})
                </div>
                
                {/* Bridge Header Row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '30px minmax(200px, 260px) minmax(0, 1fr) 120px 120px 110px',
                  gap: 12,
                  padding: '12px 16px',
                  background: '#F9FAFB',
                  borderBottom: '2px solid #E5E7EB',
                  fontWeight: 600,
                  fontSize: 11,
                  color: '#6B7280',
                  textTransform: 'uppercase'
                }}>
                  <div></div>
                  <div>Bridge</div>
                  <div>Labels</div>
                  <div>Health</div>
                  <div>Version</div>
                  <div>Actions</div>
                </div>
                    
                    {/* Bridges with nested collectors */}
                    {bridges.map(bridge => {
                      const bridgeCollectors = bridge.collectors || [];
                      const isExpanded = expandedGroups.has(bridge.agentUid);
                      return (
                        <div key={bridge.agentUid} style={{ borderBottom: '1px solid #E5E7EB' }}>
                          {/* Bridge Row */}
                          <div
                            onClick={() => {
                              const newExpanded = new Set(expandedGroups);
                              if (isExpanded) {
                                newExpanded.delete(bridge.agentUid);
                              } else {
                                newExpanded.add(bridge.agentUid);
                              }
                              setExpandedGroups(newExpanded);
                            }}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '30px minmax(200px, 260px) minmax(0, 1fr) 120px 120px 110px',
                              gap: 12,
                              padding: '12px 16px',
                              background: isExpanded ? '#F3F4F6' : 'white',
                              cursor: 'pointer',
                              transition: 'background 0.2s',
                              alignItems: 'center',
                              borderBottom: bridgeCollectors.length > 0 ? '1px solid #E5E7EB' : 'none'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = isExpanded ? '#E5E7EB' : '#F9FAFB';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = isExpanded ? '#F3F4F6' : 'white';
                            }}
                          >
                            {/* Expand/Collapse Icon */}
                            <div style={{ fontSize: 12, color: '#6B7280' }}>
                              {bridgeCollectors.length > 0 ? (isExpanded ? '▼' : '▶') : ''}
                            </div>
                            
                            {/* Bridge Name */}
                            <div style={{
                              fontFamily: 'monospace',
                              fontSize: 12,
                              color: '#111827',
                              fontWeight: 600,
                              wordBreak: 'break-all',
                              whiteSpace: 'normal'
                            }}>
                              {bridge.name}
                            </div>
                            
                            {/* Bridge Info with Labels */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              {bridge.namespace && (
                                <span style={{ fontSize: 10, fontWeight: 600, color: '#1E40AF', padding: '3px 8px', background: '#EFF6FF', borderRadius: 4, border: '1px solid #BFDBFE' }}>
                                  ns: {bridge.namespace}
                                </span>
                              )}
                              {bridge.cluster && (
                                <span style={{ fontSize: 10, fontWeight: 600, color: '#166534', padding: '3px 8px', background: '#F0FDF4', borderRadius: 4, border: '1px solid #86EFAC' }}>
                                  cluster: {bridge.cluster}
                                </span>
                              )}
                              {bridge.labels && Object.keys(bridge.labels).length > 0 ? (
                                Object.entries(bridge.labels)
                                  .filter(([key]) => !['k8s.namespace', 'k8s.cluster', 'cluster', 'namespace'].includes(key))
                                  .slice(0, 3)
                                  .map(([key, value]) => (
                                    <span key={`${key}:${value}`} style={{ fontSize: 10, color: '#374151', padding: '3px 8px', background: '#F3F4F6', borderRadius: 4 }}>
                                      {key}: {value}
                                    </span>
                                  ))
                              ) : (
                                <span style={{ fontSize: 10, color: '#9CA3AF' }}>no labels</span>
                              )}
                              <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 500 }}>
                                {bridgeCollectors.length} collector{bridgeCollectors.length !== 1 ? 's' : ''}
                              </span>
                              <CapabilityBadges
                                capabilities={bridge.capabilities}
                                limit={3}
                                compact
                                onOpenDetails={() => {
                                  setBridgeCapabilitySheet({
                                    bridge,
                                    open: true,
                                  });
                                }}
                              />
                            </div>
                            
                            {/* Bridge Status */}
                            <div>
                              {getStatusBadge(bridge.status)}
                            </div>
                            
                            {/* Bridge Version */}
                            <div style={{ fontSize: 12, color: '#6B7280' }}>
                              {bridge.version || 'unknown'}
                            </div>
                            
                            {/* Bridge Actions */}
                            <div onClick={(e) => e.stopPropagation()}>
                              {bridge.status === 'offline' && (
                                <button
                                  onClick={() => handleDeleteBridge(bridge.agentUid, bridge.name)}
                                  style={{
                                    padding: '4px 12px',
                                    background: '#FEE2E2',
                                    color: '#DC2626',
                                    border: '1px solid #FCA5A5',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    fontSize: 11,
                                    fontWeight: 500,
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#FECACA';
                                    e.currentTarget.style.borderColor = '#F87171';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = '#FEE2E2';
                                    e.currentTarget.style.borderColor = '#FCA5A5';
                                  }}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                          
                          {/* Collectors (nested) */}
                          {isExpanded && bridgeCollectors.length > 0 && (
                            <div style={{ background: '#FAFBFC', borderTop: '1px solid #E5E7EB' }}>
                              {/* Collector Header */}
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '30px 200px 1fr 120px 100px 120px',
                                gap: 12,
                                padding: '8px 16px 8px 46px',
                                background: '#F9FAFB',
                                borderBottom: '1px solid #E5E7EB',
                                fontWeight: 600,
                                fontSize: 11,
                                color: '#6B7280',
                                textTransform: 'uppercase'
                              }}>
                                <div></div>
                                <div>Collector</div>
                                <div>Labels</div>
                                <div>Health</div>
                                <div>Version</div>
                                <div>Actions</div>
                              </div>
                              
                              {/* Collector Rows */}
                              {bridgeCollectors.map(collector => (
                                <div
                                  key={collector.agentUid}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAgent(collector);
                                    setShowDetailsPanel(true);
                                  }}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '30px 200px 1fr 120px 100px 120px',
                                    gap: 12,
                                    padding: '10px 16px 10px 46px',
                                    borderBottom: '1px solid #F3F4F6',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s',
                                    alignItems: 'center'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#F9FAFB';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = '#FAFBFC';
                                  }}
                                >
                                  <div></div>
                                  
                                  {/* Collector Name */}
                                  <div style={{
                                    fontFamily: 'monospace',
                                    fontSize: 12,
                                    color: '#111827',
                                    fontWeight: 500
                                  }}>
                                    {collector.name}
                                  </div>
                                  
                                  {/* Collector Labels - Prioritize namespace, cluster, crd_name */}
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                    {collector.labels && Object.keys(collector.labels).length > 0 ? (
                                      <>
                                        {/* Priority labels first */}
                                        {collector.labels['k8s.namespace'] && (
                                          <span style={{ fontSize: 10, fontWeight: 600, color: '#1E40AF', padding: '3px 8px', background: '#EFF6FF', borderRadius: 4, border: '1px solid #BFDBFE' }}>
                                            ns: {collector.labels['k8s.namespace']}
                                          </span>
                                        )}
                                        {collector.labels['k8s.cluster'] && (
                                          <span style={{ fontSize: 10, fontWeight: 600, color: '#166534', padding: '3px 8px', background: '#F0FDF4', borderRadius: 4, border: '1px solid #86EFAC' }}>
                                            cluster: {collector.labels['k8s.cluster']}
                                          </span>
                                        )}
                                        {collector.labels['k8s.crd_name'] && (
                                          <span style={{ fontSize: 10, fontWeight: 600, color: '#92400E', padding: '3px 8px', background: '#FEF3C7', borderRadius: 4, border: '1px solid #FDE68A' }}>
                                            crd: {collector.labels['k8s.crd_name']}
                                          </span>
                                        )}
                                        {/* Other labels */}
                                        {Object.entries(collector.labels)
                                          .filter(([key]) => !['bridge.instance_uid', 'k8s.namespace', 'k8s.cluster', 'k8s.crd_name'].includes(key))
                                          .slice(0, 2)
                                          .map(([key, value]) => (
                                            <span
                                              key={key}
                                              style={{
                                                background: '#F3F4F6',
                                                color: '#374151',
                                                border: '1px solid #E5E7EB',
                                                padding: '2px 8px',
                                                borderRadius: 4,
                                                fontSize: 10,
                                                whiteSpace: 'nowrap'
                                              }}
                                            >
                                              {key}: {value}
                                            </span>
                                          ))}
                                      </>
                                    ) : (
                                      <span style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>No labels</span>
                                    )}
                                  </div>
                                  
                                  {/* Collector Status */}
                                  <div>
                                    {getStatusBadge(collector.status)}
                                  </div>
                                  
                                  {/* Collector Version */}
                                  <div style={{ fontSize: 12, color: '#6B7280' }}>
                                    {collector.version || 'unknown'}
                                  </div>
                                  
                                  {/* Actions */}
                                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    {collector.status !== 'online' && (
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          if (confirm(`Remove collector "${collector.name}"?`)) {
                                            try {
                                              await backendSrv.request({
                                                url: `/api/plugins/otel-collector-agent-fleet-management/resources/agents/${collector.agentUid}`,
                                                method: 'DELETE'
                                              });
                                              await fetchAgents();
                                              alert('Collector removed successfully');
                                            } catch (err: any) {
                                              alert('Failed to remove collector: ' + (err.message || 'Unknown error'));
                                            }
                                          }
                                        }}
                                        style={{
                                          padding: '4px 10px',
                                          background: '#EF4444',
                                          color: 'white',
                                          border: 'none',
                                          borderRadius: 4,
                                          cursor: 'pointer',
                                          fontSize: 11,
                                          fontWeight: 500
                                        }}
                                      >
                                        Remove
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    
                    {/* Non-bridge agents (standalone collectors) */}
                    {filteredAgents.filter(a => {
                      const isBridge = bridges.some(b => b.agentUid === a.agentUid);
                      const isBridgeCollector = bridges.some(b => b.collectors.some(c => c.agentUid === a.agentUid));
                      return !isBridge && !isBridgeCollector;
                    }).length > 0 && (
                      <>
                        <div style={{
                          padding: '16px',
                          background: '#F9FAFB',
                          borderTop: '2px solid #E5E7EB',
                          borderBottom: '2px solid #E5E7EB',
                          fontWeight: 600,
                          fontSize: 14,
                          color: '#111827',
                          marginTop: 16
                        }}>
                          Standalone Agents
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {/* Table Header */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '200px 1fr 120px 100px 120px',
                      gap: 12,
                      padding: '12px 16px',
                      background: '#F9FAFB',
                      borderBottom: '2px solid #E5E7EB',
                      fontWeight: 600,
                      fontSize: 12,
                      color: '#6B7280',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5
                    }}>
                      <div>Agent UID</div>
                      <div>Labels</div>
                      <div>Status</div>
                      <div>Version</div>
                      <div>Actions</div>
                    </div>
                  </>
                )}
                
                {/* Table Rows - Show standalone agents or all agents if no bridges */}
                {filteredAgents
                  .filter(a => {
                    if (bridges.length > 0) {
                      const isBridge = bridges.some(b => b.agentUid === a.agentUid);
                      const isBridgeCollector = bridges.some(b => b.collectors.some(c => c.agentUid === a.agentUid));
                      return !isBridge && !isBridgeCollector;
                    }
                    return true;
                  })
                  .map(agent => (
                  <div
                    key={agent.id}
                    onClick={() => {
                      setSelectedAgent(agent);
                      setShowDetailsPanel(true);
                    }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '200px 1fr 120px 100px 120px',
                      gap: 12,
                      padding: '12px 16px',
                      borderBottom: '1px solid #F3F4F6',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                      alignItems: 'center'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F9FAFB';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'white';
                    }}
                  >
                    {/* Agent UID */}
                    <div style={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      color: '#111827',
                      fontWeight: 500,
                      wordBreak: 'break-all',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {agent.agentUid}
                    </div>
                    
                    {/* Labels - Horizontal Display */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {agent.labels && Object.keys(agent.labels).length > 0 ? (
                        Object.entries(agent.labels).map(([key, value]) => (
                          <button
                            key={key}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLabelFilter(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? null : { key, value });
                            }}
                            style={{
                              background: selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? '#3B82F6' : '#EFF6FF',
                              color: selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? 'white' : '#1E40AF',
                              border: `1px solid ${selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? '#3B82F6' : '#BFDBFE'}`,
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 500,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              whiteSpace: 'nowrap'
                            }}
                            onMouseEnter={(e) => {
                              if (!(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value)) {
                                e.currentTarget.style.background = '#DBEAFE';
                                e.currentTarget.style.borderColor = '#93C5FD';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value)) {
                                e.currentTarget.style.background = '#EFF6FF';
                                e.currentTarget.style.borderColor = '#BFDBFE';
                              }
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{key}:</span> <span>{value}</span>
                          </button>
                        ))
                      ) : (
                        <span style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>
                          No labels
                        </span>
                      )}
                    </div>
                    
                    {/* Status */}
                    <div>
                      {getStatusBadge(agent.status)}
                    </div>
                    
                    {/* Version */}
                    <div style={{ fontSize: 12, color: '#6B7280' }}>
                      {agent.version || 'unknown'}
                    </div>
                    
                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {agent.status !== 'online' && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm(`Remove agent "${agent.name || agent.agentUid}" from the system?`)) {
                              try {
                                await backendSrv.request({
                                  url: `/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agent.agentUid}`,
                                  method: 'DELETE'
                                });
                                await fetchAgents();
                                alert('Agent removed successfully');
                              } catch (err: any) {
                                alert('Failed to remove agent: ' + (err.message || 'Unknown error'));
                              }
                            }
                          }}
                          style={{
                            padding: '4px 10px',
                            background: '#EF4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 11,
                            fontWeight: 500
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'configurations' && (
          <ConfigGenerator
            agents={agents}
            bridges={bridges}
            onPushConfig={handlePushConfig}
            backendSrv={backendSrv}
          />
        )}

          {activeTab === 'monitoring' && (
           <MonitoringSection
             agents={agents}
             bridges={bridges}
             telemetrySettings={telemetrySettings}
             telemetryLoading={telemetryLoading}
             onToggleMetrics={handleMetricsToggle}
             onToggleLogs={handleLogsToggle}
             telemetryDatasourceHints={telemetryDatasourceHints}
             onConfigureTelemetry={openTelemetryConfigurator}
           />
        )}
      </div>
       <TelemetryConfigDrawer
         open={telemetryDrawer.open}
         mode={telemetryDrawer.mode}
         metricsConfig={draftMetricsConfig}
         logsConfig={draftLogsConfig}
         onMetricsChange={setDraftMetricsConfig}
         onLogsChange={setDraftLogsConfig}
         onSave={handleTelemetryConfigSave}
         onClose={closeTelemetryConfigurator}
         saving={telemetrySaving}
       />
      {/* Details Panel (Slide-in) */}
      {showDetailsPanel && selectedAgent && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '400px',
          background: 'white',
          boxShadow: '-4px 0 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <div style={{
            padding: 20,
            borderBottom: '1px solid #E5E7EB',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>
              Collector Details
            </h3>
            <button
              onClick={() => setShowDetailsPanel(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 24,
                cursor: 'pointer',
                color: '#6B7280',
                padding: 0,
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4
              }}
            >
              ×
            </button>
          </div>
          
          {/* Tabs for Details Panel */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid #E5E7EB',
            background: '#F9FAFB'
          }}>
            {(['overview', 'capabilities', 'activity'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setDetailTab(tab)}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'none',
                  border: 'none',
                  borderBottom: detailTab === tab ? '2px solid #3B82F6' : '2px solid transparent',
                  color: detailTab === tab ? '#3B82F6' : '#6B7280',
                  fontWeight: detailTab === tab ? 600 : 500,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                {tab === 'overview' ? '📊 Overview' : tab === 'capabilities' ? '⚡ Capabilities' : '📋 Activity'}
              </button>
            ))}
          </div>
              <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
                {/* Overview Tab */}
                {detailTab === 'overview' && (
                  <>
                    {selectedAgent.orgId && (
                      <div style={{ 
                        marginBottom: 20, 
                        padding: 12, 
                        background: '#EFF6FF', 
                        borderRadius: 6,
                        border: '1px solid #BFDBFE'
                      }}>
                        <div style={{ fontSize: 11, color: '#1E40AF', fontWeight: 600, marginBottom: 4 }}>TENANT</div>
                        <div style={{ fontSize: 14, color: '#111827', fontWeight: 600, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                          <span>{selectedAgentTenantName || 'Unknown tenant'}</span>
                          <span style={{ fontSize: 12, color: '#1D4ED8', fontFamily: 'monospace' }}>
                            (ID: {selectedAgent.orgId})
                          </span>
                        </div>
                      </div>
                    )}
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Name</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
                        {selectedAgent.name || selectedAgent.agentUid}
                      </div>
                    </div>
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Agent UID</div>
                      <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#111827', background: '#F3F4F6', padding: 8, borderRadius: 4 }}>
                        {selectedAgent.agentUid}
                      </div>
                    </div>
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Status</div>
                      <div>{getStatusBadge(selectedAgent.status)}</div>
                    </div>
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Version</div>
                      <div style={{ fontSize: 14, color: '#111827' }}>{selectedAgent.version || 'unknown'}</div>
                    </div>
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Last Seen</div>
                      <div style={{ fontSize: 14, color: '#111827' }}>
                        {selectedAgent.lastSeen ? new Date(selectedAgent.lastSeen).toLocaleString() : 'Never'}
                      </div>
                    </div>
                    {selectedAgent.labels && Object.keys(selectedAgent.labels).length > 0 && (
                      <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, fontWeight: 600 }}>Labels</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {Object.entries(selectedAgent.labels).map(([key, value]) => (
                            <button
                              key={key}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLabelFilter(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? null : { key, value });
                                setShowDetailsPanel(false); // Close panel and filter by label
                              }}
                              style={{
                                background: selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? '#3B82F6' : '#EFF6FF',
                                color: selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? 'white' : '#1E40AF',
                                border: `1px solid ${selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? '#3B82F6' : '#BFDBFE'}`,
                                padding: '6px 12px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                if (!(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value)) {
                                  e.currentTarget.style.background = '#DBEAFE';
                                  e.currentTarget.style.borderColor = '#93C5FD';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value)) {
                                  e.currentTarget.style.background = '#EFF6FF';
                                  e.currentTarget.style.borderColor = '#BFDBFE';
                                }
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>{key}:</span> <span>{value}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                {/* Capabilities Tab */}
                {detailTab === 'capabilities' && (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
                        ⚡ Agent Capabilities & Metrics
                      </div>
                      <div style={{ fontSize: 12, color: '#6B7280' }}>
                        Features and capabilities supported by this agent according to OpAMP specification
                      </div>
                    </div>
                    
                    {/* Agent Metrics Section */}
                    {(() => {
                      const telemetrySamples = Array.isArray(detailPanelMonitoringData?.telemetry)
                        ? detailPanelMonitoringData.telemetry
                        : [];
                      const latestSample = telemetrySamples.find((sample: any) => {
                        if (!sample) {
                          return false;
                        }
                        const cpu = sample.cpu_percent;
                        const memory = sample.memory_bytes;
                        const inbound = sample.inbound_bandwidth_kbps;
                        const outbound = sample.outbound_bandwidth_kbps;
                        return (
                          (typeof cpu === 'number' && Number.isFinite(cpu)) ||
                          (typeof memory === 'number' && Number.isFinite(memory)) ||
                          (typeof inbound === 'number' && Number.isFinite(inbound)) ||
                          (typeof outbound === 'number' && Number.isFinite(outbound))
                        );
                      });

                      if (!latestSample) {
                        const reportsOwnTelemetry = Boolean(
                          selectedAgent?.capabilities?.reports_own_metrics === true ||
                          selectedAgent?.capabilities?.reports_own_logs === true ||
                          selectedAgent?.capabilities?.reports_own_traces === true
                        );
                        if (!reportsOwnTelemetry) {
                          return null;
                        }
                        return (
                          <div style={{ marginBottom: 24, padding: 16, background: '#F9FAFB', borderRadius: 6, border: '1px solid #E5E7EB' }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                              📊 Agent Telemetry
                            </div>
                            <div style={{ fontSize: 12, color: '#6B7280' }}>
                              This agent advertises telemetry capabilities, but no samples have been ingested yet.
                            </div>
                          </div>
                        );
                      }

                      const cpuPercent =
                        typeof latestSample.cpu_percent === 'number' && Number.isFinite(latestSample.cpu_percent)
                          ? latestSample.cpu_percent
                          : null;
                      const memoryBytes =
                        typeof latestSample.memory_bytes === 'number' && Number.isFinite(latestSample.memory_bytes)
                          ? latestSample.memory_bytes
                          : null;
                      const inboundKB =
                        typeof latestSample.inbound_bandwidth_kbps === 'number' &&
                        Number.isFinite(latestSample.inbound_bandwidth_kbps)
                          ? latestSample.inbound_bandwidth_kbps
                          : null;
                      const outboundKB =
                        typeof latestSample.outbound_bandwidth_kbps === 'number' &&
                        Number.isFinite(latestSample.outbound_bandwidth_kbps)
                          ? latestSample.outbound_bandwidth_kbps
                          : null;
                      const recordedAt = latestSample.recorded_at ? new Date(latestSample.recorded_at) : null;

                      return (
                        <div style={{ marginBottom: 24, padding: 16, background: '#F9FAFB', borderRadius: 6, border: '1px solid #E5E7EB' }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
                            📊 Agent Telemetry
                          </div>
                          {recordedAt && (
                            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 12 }}>
                              Last sample: {recordedAt.toLocaleString()}
                            </div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                            <div style={{ padding: 12, background: 'white', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>CPU Usage</div>
                              <div style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>
                                {cpuPercent !== null ? `${cpuPercent.toFixed(1)}%` : '—'}
                              </div>
                            </div>
                            <div style={{ padding: 12, background: 'white', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Memory Usage</div>
                              <div style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>
                                {memoryBytes !== null ? `${(memoryBytes / (1024 * 1024)).toFixed(1)} MB` : '—'}
                              </div>
                            </div>
                            <div style={{ padding: 12, background: 'white', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Inbound Bandwidth</div>
                              <div style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>
                                {inboundKB !== null ? `${inboundKB.toFixed(1)} KB/s` : '—'}
                              </div>
                            </div>
                            <div style={{ padding: 12, background: 'white', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Outbound Bandwidth</div>
                              <div style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>
                                {outboundKB !== null ? `${outboundKB.toFixed(1)} KB/s` : '—'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    
                    {/* Health Check Reports */}
                    {detailPanelMonitoringData?.health && detailPanelMonitoringData.health.items && detailPanelMonitoringData.health.items.length > 0 && (
                      <div style={{ marginBottom: 24, padding: 16, background: '#F9FAFB', borderRadius: 6, border: '1px solid #E5E7EB' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                          🏥 Health Check Reports
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '300px', overflowY: 'auto' }}>
                          {detailPanelMonitoringData.health.items.slice(0, 10).map((health: any, idx: number) => (
                            <div key={idx} style={{
                              padding: 12,
                              background: health.healthy ? '#D1FAE5' : '#FEE2E2',
                              borderRadius: 4,
                              border: `1px solid ${health.healthy ? '#86EFAC' : '#FECACA'}`
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: health.healthy ? '#065F46' : '#991B1B' }}>
                                  {health.healthy ? '✓ Healthy' : '✗ Unhealthy'}
                                </div>
                                <div style={{ fontSize: 11, color: '#6B7280' }}>
                                  {health.recorded_at ? new Date(health.recorded_at).toLocaleString() : 'N/A'}
                                </div>
                              </div>
                              {health.last_error && (
                                <div style={{ fontSize: 11, color: '#991B1B', fontFamily: 'monospace', marginTop: 4 }}>
                                  Error: {health.last_error}
                                </div>
                              )}
                              {health.status_message && (
                                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
                                  {health.status_message}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {loadingDetailMonitoring && (
                      <div style={{ padding: 20, textAlign: 'center', color: '#6B7280' }}>
                        Loading metrics and health data...
                      </div>
                    )}
                    {selectedAgent.capabilities && Object.keys(selectedAgent.capabilities).length > 0 ? (
                      <>
                <div style={{ 
                  fontSize: 11, 
                  color: '#6B7280', 
                  marginBottom: 12,
                  padding: 8,
                  background: '#F3F4F6',
                  borderRadius: 4
                }}>
                  According to <a href="https://opentelemetry.io/docs/specs/opamp/" target="_blank" rel="noopener noreferrer" style={{ color: '#3B82F6' }}>OpAMP Spec</a>, agents report their capabilities through AgentDescription.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Show reported capabilities */}
                  {Object.entries(selectedAgent.capabilities).map(([key, value]) => {
                    // Format boolean capabilities nicely
                    if (typeof value === 'boolean') {
                      return (
                        <div key={key} style={{
                          background: value ? '#D1FAE5' : '#FEE2E2',
                          padding: '8px 12px',
                          borderRadius: 4,
                          fontSize: 13,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8
                        }}>
                          <span style={{ fontWeight: 600 }}>{key.replace(/_/g, ' ')}:</span>
                          <span style={{ color: value ? '#065F46' : '#991B1B', fontWeight: 500 }}>
                            {value ? '✓ Supported' : '✗ Not Supported'}
                          </span>
                        </div>
                      );
                    }
                    // Format component lists
                    if (key === 'available_components' && typeof value === 'string') {
                      const components = value.split(', ');
                      return (
                        <div key={key} style={{
                          background: '#EFF6FF',
                          padding: '12px',
                          borderRadius: 4,
                          fontSize: 13
                        }}>
                          <div style={{ fontWeight: 600, marginBottom: 8, color: '#1E40AF' }}>
                            Available Components:
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {components.map((comp, idx) => (
                              <span key={idx} style={{
                                background: 'white',
                                padding: '4px 8px',
                                borderRadius: 4,
                                fontSize: 12,
                                border: '1px solid #BFDBFE'
                              }}>
                                {comp}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={key} style={{
                        background: '#F3F4F6',
                        padding: '8px 12px',
                        borderRadius: 4,
                        fontSize: 13
                      }}>
                        <strong>{key.replace(/_/g, ' ')}:</strong> {String(value)}
                      </div>
                    );
                  })}
                  {/* Show missing or unsupported capabilities */}
                  {(() => {
                    const allCapabilities = [
                      'reports_status',
                      'accepts_remote_config',
                      'reports_effective_config',
                      'accepts_packages',
                      'reports_package_statuses',
                      'reports_own_traces',
                      'reports_own_metrics',
                      'reports_own_logs',
                      'accepts_opamp_connection_settings',
                      'accepts_other_connection_settings',
                      'accepts_restart_command',
                      'reports_health',
                      'reports_remote_config',
                      'reports_heartbeat',
                      'reports_available_components',
                      'reports_connection_settings_status'
                    ];
                    
                    const capabilitySource = selectedAgent?.capabilities || {};
                    const reportedCaps = new Set(Object.keys(capabilitySource));
                    const missingCaps = allCapabilities.filter(cap => !reportedCaps.has(cap));
                    const unsupportedCaps = allCapabilities.filter(cap => 
                      reportedCaps.has(cap) && capabilitySource[cap] === false
                    );
                    
                    if (missingCaps.length === 0 && unsupportedCaps.length === 0) {
                      return null;
                    }
                    
                    return (
                      <div style={{ marginTop: 12, padding: 12, background: '#FEF3C7', borderRadius: 4, border: '1px solid #FCD34D' }}>
                        {unsupportedCaps.length > 0 && (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#92400E', marginBottom: 8 }}>
                              Capabilities Not Supported:
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: missingCaps.length > 0 ? 12 : 0 }}>
                              {unsupportedCaps.map(cap => (
                                <div key={cap} style={{
                                  background: '#FEE2E2',
                                  padding: '6px 10px',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  color: '#991B1B'
                                }}>
                                  {cap.replace(/_/g, ' ')}: ✗ Not Supported
                                  {cap === 'accepts_packages' || cap === 'reports_package_statuses' ? ' (Requires PackagesStateProvider)' : ''}
                                  {cap === 'reports_own_traces' || cap === 'reports_own_metrics' || cap === 'reports_own_logs' ? ' (Not implemented in opamp-go v0.22.0)' : ''}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        {missingCaps.length > 0 && (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#92400E', marginBottom: 8 }}>
                              Capabilities Not Reported:
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {missingCaps.map(cap => (
                                <div key={cap} style={{
                                  background: '#FEE2E2',
                                  padding: '6px 10px',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  color: '#991B1B'
                                }}>
                                  {cap.replace(/_/g, ' ')}: ✗ Not Reported
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
                      </>
                    ) : (
                      <div style={{ 
                        padding: 40, 
                        textAlign: 'center', 
                        color: '#6B7280',
                        background: '#F9FAFB',
                        borderRadius: 6
                      }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
                        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No Capabilities Reported</div>
                        <div style={{ fontSize: 12 }}>
                          This agent has not reported its OpAMP capabilities yet.
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Activity Tab */}
                {detailTab === 'activity' && (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
                        📋 Agent Activity Log
                      </div>
                      <div style={{ fontSize: 12, color: '#6B7280' }}>
                        Recent activity and events for this agent
                      </div>
                    </div>
                    
                    {/* Activity entries */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{
                        padding: 12,
                        background: '#F9FAFB',
                        borderRadius: 6,
                        border: '1px solid #E5E7EB'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>Status Change</span>
                          <span style={{ fontSize: 11, color: '#6B7280' }}>
                            {selectedAgent.lastSeen ? new Date(selectedAgent.lastSeen).toLocaleString() : 'Unknown'}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#6B7280' }}>
                          Agent status: <span style={{ fontWeight: 500, color: selectedAgent.status === 'online' ? '#10B981' : '#EF4444' }}>
                            {selectedAgent.status}
                          </span>
                        </div>
                      </div>
                      
                      {selectedAgent.lastSeen && (
                        <div style={{
                          padding: 12,
                          background: '#F9FAFB',
                          borderRadius: 6,
                          border: '1px solid #E5E7EB'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>Last Seen</span>
                            <span style={{ fontSize: 11, color: '#6B7280' }}>
                              {new Date(selectedAgent.lastSeen).toLocaleString()}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: '#6B7280' }}>
                            Agent connected via OpAMP
                          </div>
                        </div>
                      )}
                      
                      {selectedAgent.version && selectedAgent.version !== 'unknown' && (
                        <div style={{
                          padding: 12,
                          background: '#F9FAFB',
                          borderRadius: 6,
                          border: '1px solid #E5E7EB'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>Version Reported</span>
                            <span style={{ fontSize: 11, color: '#6B7280' }}>On registration</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#6B7280' }}>
                            Agent version: <span style={{ fontWeight: 500, fontFamily: 'monospace' }}>{selectedAgent.version}</span>
                          </div>
                        </div>
                      )}
                      
                      <div style={{
                        padding: 12,
                        background: '#F9FAFB',
                        borderRadius: 6,
                        border: '1px solid #E5E7EB'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>Agent Registration</span>
                          <span style={{ fontSize: 11, color: '#6B7280' }}>Initial connection</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#6B7280' }}>
                          Agent registered with OpAMP server
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ 
                      marginTop: 20, 
                      padding: 12, 
                      background: '#EFF6FF', 
                      borderRadius: 6,
                      fontSize: 12,
                      color: '#1E40AF'
                    }}>
                      💡 <strong>Tip:</strong> For detailed configuration activity, check the "Configuration History & Activity" section in the Configurations tab.
                    </div>
                  </div>
                )}
              </div>
          <div style={{
            padding: 20,
            borderTop: '1px solid #E5E7EB',
            display: 'flex',
            gap: 8
          }}>
            <button
              onClick={() => {
                if (selectedAgent.status === 'online') {
                  handlePushConfig(selectedAgent.agentUid);
                } else {
                  alert('Agent must be online to push configuration');
                }
              }}
              disabled={selectedAgent.status !== 'online' || pushingConfig === selectedAgent.agentUid}
              style={{
                flex: 1,
                padding: '10px',
                background: (selectedAgent.status === 'online' && pushingConfig !== selectedAgent.agentUid) ? '#3B82F6' : '#D1D5DB',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: (selectedAgent.status === 'online' && pushingConfig !== selectedAgent.agentUid) ? 'pointer' : 'not-allowed',
                fontSize: 14,
                fontWeight: 500,
                minHeight: '40px',
                transition: 'all 0.2s'
              }}
              title={selectedAgent.status !== 'online' ? 'Agent must be online' : 'Push latest approved configuration to agent'}
            >
              {pushingConfig === selectedAgent.agentUid ? 'Pushing...' : 'Push Latest Approved Config'}
            </button>
            <button
              onClick={() => {
                if (selectedAgent.status === 'online') {
                  handleUpgrade(selectedAgent.agentUid);
                } else {
                  alert('Agent must be online to upgrade');
                }
              }}
              disabled={selectedAgent.status !== 'online' || upgradingAgent === selectedAgent.agentUid}
              style={{
                flex: 1,
                padding: '10px',
                background: (selectedAgent.status === 'online' && upgradingAgent !== selectedAgent.agentUid) ? '#F59E0B' : '#D1D5DB',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: (selectedAgent.status === 'online' && upgradingAgent !== selectedAgent.agentUid) ? 'pointer' : 'not-allowed',
                fontSize: 14,
                fontWeight: 500,
                minHeight: '40px',
                transition: 'all 0.2s'
              }}
              title="Upgrades restart the collector process and may require compatible CRDs/operators."
            >
              {upgradingAgent === selectedAgent.agentUid ? 'Upgrading...' : 'Upgrade'}
            </button>
          </div>
          <div style={{ padding: '8px 20px 0', fontSize: 11, color: '#92400E', lineHeight: 1.4 }}>
            ⚠️ This action only asks the collector process to restart with whatever image/tag is currently defined in the CRD.
            It does <strong>not</strong> patch <code>spec.image</code>, upgrade the OpenTelemetry Collector Operator, or apply CRD migrations for you.
            Review the{' '}
            <a href="https://github.com/open-telemetry/opentelemetry-collector-releases/releases" target="_blank" rel="noopener noreferrer" style={{ color: '#B45309', textDecoration: 'underline' }}>
              upstream release notes
            </a>{' '}
            and update your CRD (e.g., <code>spec.image</code>, resources, feature flags) before using this button.
          </div>
        </div>
      )}
      {bridgeCapabilitySheet.open && bridgeCapabilitySheet.bridge && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.45)',
              zIndex: 1090,
            }}
            onClick={closeBridgeCapabilitySheet}
          />
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 420,
              background: 'white',
              boxShadow: '-6px 0 18px rgba(15,23,42,0.25)',
              zIndex: 1100,
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideIn 0.25s ease-out',
            }}
          >
            <div style={{ padding: 20, borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{bridgeCapabilitySheet.bridge.name}</div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>Bridge Capabilities</div>
              </div>
              <button
                onClick={closeBridgeCapabilitySheet}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 24,
                  cursor: 'pointer',
                  color: '#6B7280',
                  width: 32,
                  height: 32,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: 20, overflowY: 'auto' }}>
              {bridgeCapabilitySheet.bridge.capabilities ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(bridgeCapabilitySheet.bridge.capabilities)
                    .sort((a, b) => {
                      const ai = capabilityOrder.indexOf(a[0]);
                      const bi = capabilityOrder.indexOf(b[0]);
                      return (ai === -1 ? capabilityOrder.length : ai) - (bi === -1 ? capabilityOrder.length : bi);
                    })
                    .map(([key, value]) => {
                      const meta = capabilityMeta[key] || {
                        label: key.replace(/_/g, ' '),
                        description: 'Reported capability',
                        icon: '✨',
                        tone: { bg: '#F3F4F6', border: '#E5E7EB', color: '#111827' },
                      };
                      const enabled = isCapabilityEnabled(value);
                      return (
                        <div
                          key={key}
                          style={{
                            border: `1px solid ${meta.tone.border}`,
                            borderRadius: 10,
                            padding: 14,
                            background: meta.tone.bg,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: meta.tone.color, fontWeight: 600 }}>
                              <span>{meta.icon}</span>
                              <span>{meta.label}</span>
                            </div>
                            <span style={{ fontSize: 12, color: enabled ? '#059669' : '#B91C1C', fontWeight: 600 }}>
                              {enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: '#4B5563' }}>{meta.description}</div>
                          {!enabled && (
                            <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                              Raw value: <code>{String(value)}</code>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#6B7280' }}>No capabilities reported by this bridge.</div>
              )}
            </div>
          </div>
        </>
      )}


      {/* Overlay for panel */}
      {showDetailsPanel && (
        <div
          onClick={() => setShowDetailsPanel(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 999
          }}
        />
      )}

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
};
