import React from 'react';
import * as yaml from 'js-yaml';
import type { Agent, Bridge, ComponentCategory } from '../types';
import {
  formatComponentLabel,
  cloneSampleConfig,
  mergeComponentTypeLists,
  builtinReceiverTemplates,
  builtinProcessorTemplates,
  builtinExporterTemplates,
  inferComponentType,
} from '../utils/components';
import { getStatusBadge } from '../utils/helpers';

const { useState, useEffect, useMemo, useCallback } = React;

export function ConfigGenerator({ 
  agents, 
  bridges, 
  onPushConfig,
  backendSrv,
  initialAgentUID,
}: { 
  agents: Agent[]; 
  bridges: Bridge[]; 
  onPushConfig: (uid: string, config: string) => void;
  initialAgentUID?: string;
  backendSrv: {
    get: <T = any>(url: string, options?: any) => Promise<T>;
    post: <T = any>(url: string, data?: any, options?: any) => Promise<T>;
    delete: <T = any>(url: string, options?: any) => Promise<T>;
    patch: <T = any>(url: string, data?: any, options?: any) => Promise<T>;
    request: <T = any>(options: any) => Promise<T>;
  };
}) {
  const [receivers, setReceivers] = useState<any[]>([]);
  const [processors, setProcessors] = useState<any[]>([]);
  const [exporters, setExporters] = useState<any[]>([]);
  const [generatedConfig, setGeneratedConfig] = useState('');
  const [selectedAgentUID, setSelectedAgentUID] = useState(initialAgentUID || '');
  const selectionRef = React.useRef(selectedAgentUID);
  selectionRef.current = selectedAgentUID;
  useEffect(() => {
    if (initialAgentUID) setSelectedAgentUID(initialAgentUID);
  }, [initialAgentUID]);
  const [savedTemplates, setSavedTemplates] = useState<any[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [expandedComponents, setExpandedComponents] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [deletingTemplateId, setDeletingTemplateId] = useState<number | null>(null);
  const [configVersions, setConfigVersions] = useState<any[]>([]);
  const [configSyncStatus, setConfigSyncStatus] = useState<Record<number, any>>({});
  const [selectedConfigVersion, setSelectedConfigVersion] = useState<any | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [diffData, setDiffData] = useState<any>(null);
  const [showFullDiff, setShowFullDiff] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canEditConfig, setCanEditConfig] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject' | null>(null);
  const [approvalConfigId, setApprovalConfigId] = useState<string | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  
  // Component Type Manager state
  const [showComponentTypeManager, setShowComponentTypeManager] = useState(false);
  const [editingComponentType, setEditingComponentType] = useState<any>(null);
  
  // Dynamic component types
  const [receiverTypes, setReceiverTypes] = useState<any[]>([]);
  const [processorTypes, setProcessorTypes] = useState<any[]>([]);
  const [exporterTypes, setExporterTypes] = useState<any[]>([]);
  const registerDiscoveredTypes = useCallback(
    (category: ComponentCategory, discovered: Array<{ type: string; sample?: any }>) => {
      if (!discovered || discovered.length === 0) {
        return;
      }
      const setter =
        category === 'receiver'
          ? setReceiverTypes
          : category === 'processor'
          ? setProcessorTypes
          : setExporterTypes;
      setter((prev = []) => {
        const existing = new Set(prev.map((opt: any) => opt.value));
        let mutated = false;
        const next = [...prev];
        for (const entry of discovered) {
          const normalized = entry.type?.trim();
          if (!normalized || normalized === 'custom' || existing.has(normalized)) {
            continue;
          }
          existing.add(normalized);
          mutated = true;
          next.push({
            value: normalized,
            label: formatComponentLabel(normalized),
            config: cloneSampleConfig(entry.sample || {}),
            isSystem: false,
            isCustom: true,
            isDiscovered: true,
          });
        }
        return mutated ? next : prev;
      });
    },
    [setReceiverTypes, setProcessorTypes, setExporterTypes]
  );
  
  // Raw YAML mode
  const [useRawYAML, setUseRawYAML] = useState(false);
  const [rawYAMLConfig, setRawYAMLConfig] = useState('');
  const [includeDeploymentSettings, setIncludeDeploymentSettings] = useState(false);

  // Signal selection (logs, metrics, traces)
  const [selectedSignals, setSelectedSignals] = useState<{ logs: boolean; metrics: boolean; traces: boolean }>({
    logs: true,
    metrics: true,
    traces: true
  });

  // CRD Settings (for full OpenTelemetryCollector spec)
  const [showCRDSettings, setShowCRDSettings] = useState(false);
  const [crdSettings, setCrdSettings] = useState({
    name: '',  // Optional: for creating NEW collectors
    namespace: '',  // Optional: for creating NEW collectors
    mode: 'deployment' as 'deployment' | 'daemonset' | 'statefulset' | 'sidecar',
    replicas: 1,
    image: 'otel/opentelemetry-collector-contrib:latest',
    managementState: 'managed' as 'managed' | 'unmanaged',
    upgradeStrategy: 'automatic' as 'automatic' | 'none',
    resources: {
      requests: {
        cpu: '200m',
        memory: '256Mi'
      },
      limits: {
        cpu: '1000m',
        memory: '1Gi'
      }
    },
    advancedYaml: ''  // For custom fields: targetAllocator, volumes, serviceAccount, etc.
  });

  useEffect(() => {
    setIncludeDeploymentSettings(false);
  }, [selectedAgentUID]);

  useEffect(() => {
    loadTemplates();
    // Get user role from agents API response
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    try {
      const roleResponse = await backendSrv.get('/user-role');
      setIsAdmin(roleResponse?.isAdmin === true && roleResponse?.role === 2);
      setCanEditConfig(roleResponse?.role === 1 || roleResponse?.role === 2);
    } catch (err) {
      console.error('Failed to fetch user role:', err);
      setIsAdmin(false);
      setCanEditConfig(false);
    }
  };

  useEffect(() => {
    // Do not leave another agent's editable content visible during the handoff.
    setReceivers([]);
    setProcessors([]);
    setExporters([]);
    setGeneratedConfig('');
    setRawYAMLConfig('');
    setConfigVersions([]);
    setConfigSyncStatus({});
    setSelectedConfigVersion(null);
    setDiffData(null);
    if (selectedAgentUID) {
      loadConfigVersions(selectedAgentUID);
      // Auto-load current config from agent when agent is selected
      loadCurrentConfig(selectedAgentUID);
    } else {
      // Clear config when no agent is selected
      setReceivers([]);
      setProcessors([]);
      setExporters([]);
      setGeneratedConfig('');
    }
  }, [selectedAgentUID]);

  const loadTemplates = async () => {
    try {
      const response = await backendSrv.get('/api/plugins/otel-collector-agent-fleet-management/resources/config-templates');
      setSavedTemplates(response.items || []);
    } catch (err: any) {
      console.error('Failed to load templates:', err);
    }
  };

  const loadConfigVersions = async (agentUID: string) => {
    if (!agentUID || agentUID.trim() === '') {
      console.warn('loadConfigVersions called without agentUID, clearing versions');
      setConfigVersions([]);
      setConfigSyncStatus({});
      return;
    }
    try {
      const response = await backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/configs?agent_uid=${encodeURIComponent(agentUID)}`);
      if (selectionRef.current !== agentUID) return;
      // Ensure we only show configs for THIS specific agent
      const filteredConfigs = (response.items || []).filter((cfg: any) => cfg.agentUid === agentUID);
      console.log(`Loaded ${filteredConfigs.length} config versions for agent ${agentUID}`);
      setConfigVersions(filteredConfigs);
      
      // Load sync status for pushed configs
      const pushedConfigs = filteredConfigs.filter((cfg: any) => cfg.pushedAt);
      const syncStatusMap: Record<number, any> = {};
      for (const cfg of pushedConfigs) {
        try {
          const syncResp: any = await backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/config-sync-status`);
          if (selectionRef.current !== agentUID) return;
          syncStatusMap[cfg.id] = syncResp;
        } catch (err) {
          console.log('Could not load sync status for config', cfg.id, err);
        }
      }
      if (Object.keys(syncStatusMap).length > 0) {
        setConfigSyncStatus(syncStatusMap);
      }
    } catch (err: any) {
      if (selectionRef.current !== agentUID) return;
      console.error('Failed to load config versions for agent', agentUID, err);
      setConfigVersions([]);
      setConfigSyncStatus({});
    }
  };
  
  // Fix 3: Clear bridge selection if a bridge is selected (bridges cannot receive collector configs)
  useEffect(() => {
    if (!selectedAgentUID) return;
    const selectedIsBridge = bridges.some(b => b.agentUid === selectedAgentUID);
    if (selectedIsBridge) {
      setSelectedAgentUID('');
    }
  }, [selectedAgentUID, bridges]);

  // Poll sync status for pushed configs every 5 seconds
  useEffect(() => {
    if (!selectedAgentUID) return;
    
    const pushedConfigs = configVersions.filter((v: any) => v.pushedAt);
    if (pushedConfigs.length === 0) return;
    
    const checkSync = async () => {
      for (const cfg of pushedConfigs) {
        try {
          const syncResp: any = await backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${selectedAgentUID}/config-sync-status`);
          setConfigSyncStatus((prev) => ({ ...prev, [cfg.id]: syncResp }));
        } catch (err) {
          console.log('Could not check sync status for config', cfg.id, err);
        }
      }
    };
    
    checkSync();
    const interval = setInterval(checkSync, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [selectedAgentUID, configVersions, backendSrv]);

  const loadCurrentConfig = async (agentUID: string) => {
    try {
      const response = await backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/current-config`);
      if (selectionRef.current !== agentUID) return;
      if (response.hasConfig && response.config) {
        parseConfigYAML(response.config);
        alert('✓ Successfully loaded and parsed current configuration from agent!');
      } else {
        alert('⚠ Agent does not have a current configuration yet.');
      }
    } catch (err: any) {
      if (selectionRef.current !== agentUID) return;
      console.error('Failed to load current config:', err);
      alert('Failed to load current config: ' + (err.message || 'Unknown error'));
    }
  };

  const parseConfigYAML = (yamlConfig: string): boolean => {
    try {
      const parsed = yaml.load(yamlConfig) as any;
      const discoveredReceiverSamples: Record<string, any> = {};
      const discoveredProcessorSamples: Record<string, any> = {};
      const discoveredExporterSamples: Record<string, any> = {};
      
      // Extract receivers
      const parsedReceivers: any[] = [];
      if (parsed.receivers && typeof parsed.receivers === 'object') {
        for (const [name, config] of Object.entries(parsed.receivers)) {
          const recConfig = config as any;
          const recType = inferComponentType('receiver', name, recConfig);
          if (recType !== 'custom' && !discoveredReceiverSamples[recType]) {
            discoveredReceiverSamples[recType] = recConfig;
          }
          parsedReceivers.push({
            name,
            type: recType,
            ...recConfig,
            // If type is custom, store original as customYaml
            ...(recType === 'custom' ? { customYaml: yaml.dump({ [name]: recConfig }) } : {})
          });
        }
      }

      // Extract processors
      const parsedProcessors: any[] = [];
      if (parsed.processors && typeof parsed.processors === 'object') {
        for (const [name, config] of Object.entries(parsed.processors)) {
          const procConfig = config as any;
          const procType = inferComponentType('processor', name, procConfig) || 'custom';
          if (procType !== 'custom' && !discoveredProcessorSamples[procType]) {
            discoveredProcessorSamples[procType] = procConfig;
          }
          parsedProcessors.push({
            name,
            type: procType,
            ...procConfig,
            ...(procType === 'custom' ? { customYaml: yaml.dump({ [name]: procConfig }) } : {})
          });
        }
      }

      // Extract exporters
      const parsedExporters: any[] = [];
      if (parsed.exporters && typeof parsed.exporters === 'object') {
        for (const [name, config] of Object.entries(parsed.exporters)) {
          const expConfig = config as any;
          const expType = inferComponentType('exporter', name, expConfig);
          if (expType !== 'custom' && !discoveredExporterSamples[expType]) {
            discoveredExporterSamples[expType] = expConfig;
          }
          parsedExporters.push({
            name,
            type: expType,
            ...expConfig,
            ...(expType === 'custom' ? { customYaml: yaml.dump({ [name]: expConfig }) } : {})
          });
        }
      }

      // Extract extensions and other custom sections
      const customSections: any[] = [];
      for (const [key, value] of Object.entries(parsed)) {
        if (!['receivers', 'processors', 'exporters', 'service'].includes(key)) {
          customSections.push({
            name: key,
            type: 'custom',
            section: key,
            customYaml: yaml.dump({ [key]: value })
          });
        }
      }

      // Update state with parsed components
      setReceivers(parsedReceivers);
      setProcessors(parsedProcessors);
      setExporters(parsedExporters);
      registerDiscoveredTypes(
        'receiver',
        Object.entries(discoveredReceiverSamples).map(([type, sample]) => ({ type, sample }))
      );
      registerDiscoveredTypes(
        'processor',
        Object.entries(discoveredProcessorSamples).map(([type, sample]) => ({ type, sample }))
      );
      registerDiscoveredTypes(
        'exporter',
        Object.entries(discoveredExporterSamples).map(([type, sample]) => ({ type, sample }))
      );
      
      // Expand all components for visibility - Initialize allKeys first
      const allKeys = new Set<string>();
      parsedReceivers.forEach((_, i) => allKeys.add(`receiver-${i}`));
      parsedProcessors.forEach((_, i) => allKeys.add(`processor-${i}`));
      parsedExporters.forEach((_, i) => allKeys.add(`exporter-${i}`));

      // Store custom sections separately - add to exporters list with special marking
      if (customSections.length > 0) {
        const customComponents = customSections.map(cs => ({
          name: `custom_${cs.section}`,
          type: 'custom',
          customYaml: yaml.dump({ [cs.section]: parsed[cs.section] }),
          _isExtension: true,
          _sectionName: cs.section
        }));
        setExporters([...parsedExporters, ...customComponents]);
        
        // Update expanded components to include custom ones
        const customKeys = customComponents.map((_, i) => `exporter-${parsedExporters.length + i}`);
        customKeys.forEach(key => allKeys.add(key));
      }

      // Extract signals from pipelines (only show signals that are already in the config)
      const signalsInConfig: { logs: boolean; metrics: boolean; traces: boolean } = {
        logs: false,
        metrics: false,
        traces: false,
      };
      
      if (parsed.service?.pipelines) {
        const pipelines = parsed.service.pipelines;
        if (pipelines.logs) signalsInConfig.logs = true;
        if (pipelines.metrics) signalsInConfig.metrics = true;
        if (pipelines.traces) signalsInConfig.traces = true;
      }
      
      // Set selected signals to only those present in the current config
      setSelectedSignals(signalsInConfig);

      // Set generated config to original (in case user wants to see/edit it)
      setGeneratedConfig(yamlConfig);
      setRawYAMLConfig(yamlConfig);
      
      // Set expanded components
      setExpandedComponents(allKeys);

      return true;
    } catch (err: any) {
      console.error('Failed to parse config YAML:', err);
      alert('Failed to parse current configuration: ' + (err.message || 'Unknown error'));
      return false;
    }
  };

  const loadConfigDiff = async (configId: string, compareId?: string) => {
    if (!configId || configId === 'undefined' || configId === 'null') {
      alert('Invalid config ID for diff operation');
      return;
    }
    if (!selectedAgentUID) {
      alert('Please select an agent first');
      return;
    }
    try {
      // Use agent-based diff endpoint which compares with baseline (first sync)
      const url = `/api/plugins/otel-collector-agent-fleet-management/resources/agents/${selectedAgentUID}/config-diff?config_id=${configId}`;
      console.log('Loading diff for config:', configId, 'against baseline, URL:', url);
      const response = await backendSrv.get(url);
      setDiffData(response);
      setShowFullDiff(false);
      setShowDiff(true);
    } catch (err: any) {
      const errMsg = err.data?.message || err.message || err.statusText || 'Unknown error';
      console.error('Failed to load diff:', err, 'configId:', configId);
      if (errMsg.includes('not found') || errMsg.includes('404')) {
        alert('Failed to load diff: Configuration not found. This might be the first version with nothing to compare against.');
      } else if (errMsg.includes('invalid config ID')) {
        alert('Failed to load diff: Invalid config ID. Please refresh the page and try again.');
      } else {
        alert('Failed to load diff: ' + errMsg + '\n\nIf this is the first version, there is no baseline to compare against.');
      }
    }
  };

  const handleApprovalClick = (configId: string, action: 'approve' | 'reject') => {
    setApprovalAction(action);
    setApprovalConfigId(configId);
    setApprovalComment('');
    setShowApprovalDialog(true);
  };

  const approveConfig = async () => {
    if (!approvalConfigId || !approvalAction) return;
    
    const actionText = approvalAction === 'approve' ? 'approve' : 'reject';
    const commentRequired = approvalAction === 'reject';
    
    if (commentRequired && !approvalComment.trim()) {
      alert('Please provide a comment explaining why you are rejecting this configuration.');
      return;
    }
    
    try {
      const response = await backendSrv.post(`/api/plugins/otel-collector-agent-fleet-management/resources/configs/${approvalConfigId}/approve`, {
        action: approvalAction,
        comment: approvalComment.trim() || null
      });
      if (selectedAgentUID) {
        await loadConfigVersions(selectedAgentUID);
      }
      setShowApprovalDialog(false);
      setApprovalAction(null);
      setApprovalConfigId(null);
      setApprovalComment('');
      alert(`✅ Configuration ${actionText}d successfully!`);
    } catch (err: any) {
      const errMsg = err.data?.message || err.message || err.statusText || 'Unknown error';
      console.error(`Failed to ${actionText} config:`, err);
      if (errMsg.includes('forbidden') || errMsg.includes('insufficient role')) {
        alert(`❌ Failed to ${actionText} config: Grafana Admin role required.\n\nError: ${errMsg}`);
      } else {
        alert(`❌ Failed to ${actionText} config: ${errMsg}`);
      }
    }
  };

  const revertConfig = async (configId: number) => {
    if (!configId || isNaN(configId)) {
      alert('Invalid config ID for revert operation');
      return;
    }
    if (!confirm('Are you sure you want to revert to this configuration version? This will create a new version.')) return;
    try {
      const response = await backendSrv.post('/api/plugins/otel-collector-agent-fleet-management/resources/configs/revert', {
        configId: Number(configId)
      });
      if (selectedAgentUID) {
        await loadConfigVersions(selectedAgentUID);
      }
      alert('✅ Configuration reverted successfully! A new version has been created with pending approval.');
    } catch (err: any) {
      const errMsg = err.data?.message || err.message || err.statusText || 'Unknown error';
      console.error('Failed to revert config:', err, 'configId:', configId);
      alert('❌ Failed to revert config: ' + errMsg);
    }
  };

  const saveTemplate = async () => {
    if (!saveName.trim()) {
      alert('Please enter a name for the template');
      return;
    }
    try {
      await backendSrv.post('/api/plugins/otel-collector-agent-fleet-management/resources/config-templates', {
        name: saveName,
        description: saveDescription,
        receivers,
        processors,
        exporters
      });
      setShowSaveDialog(false);
      setSaveName('');
      setSaveDescription('');
      await loadTemplates();
      alert('Template saved successfully!');
    } catch (err: any) {
      alert('Failed to save template: ' + (err.message || 'Unknown error'));
    }
  };

  const loadTemplate = (template: any) => {
    setReceivers(template.receivers || []);
    setProcessors(template.processors || []);
    setExporters(template.exporters || []);
    setGeneratedConfig('');
    setExpandedComponents(new Set());
  };

  const deleteTemplate = async (id: number) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    setDeletingTemplateId(id);
    try {
      await backendSrv.request({
        url: `/api/plugins/otel-collector-agent-fleet-management/resources/config-templates?id=${id}`,
        method: 'DELETE'
      });
      await loadTemplates();
    } catch (err: any) {
      alert('Failed to delete template: ' + (err.message || 'Unknown error'));
    } finally {
      setDeletingTemplateId(null);
    }
  };

  // Signal compatibility mapping for OpenTelemetry components
  const getComponentSignals = (component: any, componentType: 'receiver' | 'processor' | 'exporter'): string[] => {
    const type = component.type || '';
    const name = component.name || '';
    
    // Check if it's a custom component - assume all signals
    if (type === 'custom' || !type) {
      return ['logs', 'metrics', 'traces'];
    }

    // Receiver signal compatibility
    if (componentType === 'receiver') {
      const receiverSignalMap: Record<string, string[]> = {
        'filelog': ['logs'],
        'hostmetrics': ['metrics'],
        'prometheus': ['metrics'],
        'kubeletstats': ['metrics'],
        'jmx': ['metrics'],
        'otlp': ['logs', 'metrics', 'traces'],
        'jaeger': ['traces'],
        'zipkin': ['traces'],
        'kafka': ['logs', 'metrics', 'traces'],
        'syslog': ['logs'],
        'journald': ['logs'],
        'fluentforward': ['logs'],
        'carbon': ['metrics'],
        'collectd': ['metrics'],
        'statsd': ['metrics'],
        'opencensus': ['metrics', 'traces'],
        'signalfx': ['metrics'],
        'wavefront': ['metrics'],
        'splunk_hec': ['logs', 'metrics', 'traces'],
      };
      return receiverSignalMap[type] || ['logs', 'metrics', 'traces'];
    }

    // Processor signal compatibility
    if (componentType === 'processor') {
      const processorSignalMap: Record<string, string[]> = {
        'cumulativetodelta': ['metrics'],
        'deltatorate': ['metrics'],
        'probabilistic_sampler': ['traces'],
        'servicegraph': ['traces'],
        'span': ['traces'],
        'tail_sampling': ['traces'],
        'batch': ['logs', 'metrics', 'traces'],
        'attributes': ['logs', 'metrics', 'traces'],
        'resource': ['logs', 'metrics', 'traces'],
        'memory_limiter': ['logs', 'metrics', 'traces'],
        'filter': ['logs', 'metrics', 'traces'],
        'transform': ['logs', 'metrics', 'traces'],
        'groupbytrace': ['traces'],
        'k8sattributes': ['logs', 'metrics', 'traces'],
        'metricstransform': ['metrics'],
        'routing': ['logs', 'metrics', 'traces'],
        'spanmetrics': ['traces'],
      };
      return processorSignalMap[type] || ['logs', 'metrics', 'traces'];
    }

    // Exporter signal compatibility
    if (componentType === 'exporter') {
      const exporterSignalMap: Record<string, string[]> = {
        'elasticsearch': ['logs', 'metrics'], // Primarily logs, but can do metrics
        'splunk_hec': ['logs', 'metrics', 'traces'],
        'kafka': ['logs', 'metrics', 'traces'],
        'otlp': ['logs', 'metrics', 'traces'],
        'logging': ['logs', 'metrics', 'traces'],
        'debug': ['logs', 'metrics', 'traces'],
        'prometheus': ['metrics'],
        'prometheusremotewrite': ['metrics'],
        'datadog': ['logs', 'metrics', 'traces'],
        'dynatrace': ['logs', 'metrics', 'traces'],
        'newrelic': ['logs', 'metrics', 'traces'],
        'signalfx': ['metrics'],
        'wavefront': ['metrics'],
        'jaeger': ['traces'],
        'zipkin': ['traces'],
        'opencensus': ['metrics', 'traces'],
        'carbon': ['metrics'],
        'sapm': ['traces'],
      };
      return exporterSignalMap[type] || ['logs', 'metrics', 'traces'];
    }

    return ['logs', 'metrics', 'traces'];
  };
  // Compute available signals based on selected components
  const getAvailableSignals = (): { logs: boolean; metrics: boolean; traces: boolean } => {
    if (receivers.length === 0 && processors.length === 0 && exporters.length === 0) {
      return { logs: true, metrics: true, traces: true };
    }

    const receiverSignals = receivers.length > 0 
      ? receivers.map(r => getComponentSignals(r, 'receiver')).reduce((acc, signals) => {
          signals.forEach(s => acc.add(s));
          return acc;
        }, new Set<string>())
      : new Set(['logs', 'metrics', 'traces']);

    const processorSignals = processors.length > 0
      ? processors.map(p => getComponentSignals(p, 'processor')).reduce((acc, signals) => {
          signals.forEach(s => acc.add(s));
          return acc;
        }, new Set<string>())
      : new Set(['logs', 'metrics', 'traces']);

    const exporterSignals = exporters.length > 0
      ? exporters.map(e => getComponentSignals(e, 'exporter')).reduce((acc, signals) => {
          signals.forEach(s => acc.add(s));
          return acc;
        }, new Set<string>())
      : new Set(['logs', 'metrics', 'traces']);

    // Intersect all signals - only signals supported by all component types
    const allSignals = ['logs', 'metrics', 'traces'];
    const available: { logs: boolean; metrics: boolean; traces: boolean } = {
      logs: receiverSignals.has('logs') && processorSignals.has('logs') && exporterSignals.has('logs'),
      metrics: receiverSignals.has('metrics') && processorSignals.has('metrics') && exporterSignals.has('metrics'),
      traces: receiverSignals.has('traces') && processorSignals.has('traces') && exporterSignals.has('traces'),
    };

    return available;
  };

  // Update selected signals when components change
  useEffect(() => {
    const available = getAvailableSignals();
    setSelectedSignals(prev => ({
      logs: available.logs && prev.logs,
      metrics: available.metrics && prev.metrics,
      traces: available.traces && prev.traces,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receivers, processors, exporters]);

  const isValidHostPort = (value?: string | null) => {
    if (!value) {
      return false;
    }
    const trimmed = value.trim();
    if (trimmed === '') {
      return false;
    }
    // IPv6 support: allow [::1]:4317
    if (trimmed.startsWith('[')) {
      const closing = trimmed.indexOf(']');
      if (closing > 0) {
        const portPart = trimmed.slice(closing + 1);
        if (portPart.startsWith(':')) {
          const port = Number(portPart.slice(1));
          return Number.isInteger(port) && port > 0 && port <= 65535;
        }
      }
      return false;
    }
    const parts = trimmed.split(':');
    if (parts.length !== 2) {
      return false;
    }
    const port = Number(parts[1]);
    return parts[0].length > 0 && Number.isInteger(port) && port > 0 && port <= 65535;
  };

  const isValidHttpUrl = (value?: string | null) => {
    if (!value) {
      return false;
    }
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const validateCRDSettings = (opts: {
    includeDeploymentSettings: boolean;
    crdSettings: typeof crdSettings;
    isNewCollector: boolean;
    canModifyDeploymentSettings: boolean;
  }) => {
    const errors: string[] = [];
    if (!opts.includeDeploymentSettings) {
      return errors;
    }
    if (!(opts.isNewCollector || opts.canModifyDeploymentSettings)) {
      return errors;
    }
    const settings = opts.crdSettings;
    if (!settings.name?.trim()) {
      errors.push('CRD name is required when deployment settings are enabled.');
    }
    if (!settings.namespace?.trim()) {
      errors.push('CRD namespace is required when deployment settings are enabled.');
    }
    if (!settings.image?.trim()) {
      errors.push('Collector image is required in deployment settings.');
    }
    if ((settings.mode === 'deployment' || settings.mode === 'statefulset') && (!settings.replicas || settings.replicas < 1)) {
      errors.push('Replicas must be at least 1 for deployment/statefulset modes.');
    }
    const cpuReq = settings.resources.requests.cpu?.trim();
    const memReq = settings.resources.requests.memory?.trim();
    const cpuLimit = settings.resources.limits.cpu?.trim();
    const memLimit = settings.resources.limits.memory?.trim();
    if (!cpuReq || !memReq || !cpuLimit || !memLimit) {
      errors.push('CPU/Memory requests and limits must be provided in deployment settings.');
    }
    return errors;
  };
  const generateConfig = async () => {
    if (receivers.length === 0) {
      alert('Please add at least one receiver');
      return;
    }

    // Warn if no exporters (but allow generation for preview/testing)
    if (exporters.length === 0) {
      const proceed = confirm('No exporters configured. The generated config will not have a complete pipeline.\n\n' +
        'Note: OpenTelemetry Collector requires at least one exporter to send data.\n\n' +
        'Do you want to continue generating the config anyway?');
      if (!proceed) {
        return;
      }
    }

    // Validate that at least one signal is selected
    const availableSignals = getAvailableSignals();
    const hasSelectedSignal = Object.entries(selectedSignals).some(
      ([signal, selected]) => selected && availableSignals[signal as keyof typeof availableSignals]
    );

    if (!hasSelectedSignal) {
      alert('Please select at least one telemetry signal (logs, metrics, or traces) that is compatible with your selected components.');
      return;
    }

    // Validate all components have required fields
    const invalidComponents: string[] = [];
    receivers.forEach((r, i) => {
      if (!r.type || r.type === '') {
        invalidComponents.push(`Receiver ${i + 1} (${r.name || 'unnamed'}) is missing type`);
      }
      if (r.type === 'otlp') {
        const grpcEndpoint = r.protocols?.grpc?.endpoint?.trim();
        const httpEndpoint = r.protocols?.http?.endpoint?.trim();
        if (!grpcEndpoint && !httpEndpoint) {
          invalidComponents.push(`Receiver ${i + 1} (${r.name || 'otlp'}) requires at least one endpoint (gRPC and/or HTTP).`);
        }
        if (grpcEndpoint && !isValidHostPort(grpcEndpoint)) {
          invalidComponents.push(`Receiver ${i + 1} (${r.name || 'otlp'}) has invalid gRPC endpoint "${grpcEndpoint}". Use host:port (e.g., 0.0.0.0:4317).`);
        }
        if (httpEndpoint && !isValidHostPort(httpEndpoint)) {
          invalidComponents.push(`Receiver ${i + 1} (${r.name || 'otlp'}) has invalid HTTP endpoint "${httpEndpoint}". Use host:port (e.g., 0.0.0.0:4318).`);
        }
      }
    });
    processors.forEach((p, i) => {
      if (!p.type || p.type === '') {
        invalidComponents.push(`Processor ${i + 1} (${p.name || 'unnamed'}) is missing type`);
      }
      // Validate processor name doesn't match type (e.g., "attributes_2" should have type "attributes", not "attributes_2")
      if (p.name && p.type && p.name === p.type && !p.name.includes('_')) {
        console.warn(`Processor ${p.name} has type matching its name. This may cause validation errors.`);
      }
    });
    exporters.forEach((e, i) => {
      if (!e.type || e.type === '') {
        invalidComponents.push(`Exporter ${i + 1} (${e.name || 'unnamed'}) is missing type`);
      }
      if (e.type === 'otlp') {
        const endpoint = e.endpoint?.trim();
        if (!endpoint) {
          invalidComponents.push(`Exporter ${i + 1} (${e.name || 'otlp'}) requires an endpoint (http://host:port or host:port).`);
        } else if (!isValidHttpUrl(endpoint) && !isValidHostPort(endpoint)) {
          invalidComponents.push(`Exporter ${i + 1} (${e.name || 'otlp'}) endpoint "${endpoint}" is invalid. Use http(s) URL or host:port for gRPC.`);
        }
      }
    });
    // Check if selected agent is a DaemonSet collector
    const selectedAgent = agents.find((a: Agent) => a.agentUid === selectedAgentUID);
    const isDaemonSet = selectedAgent?.labels?.['k8s.crd_name']?.toLowerCase().includes('daemonset') || 
                        selectedAgent?.name?.toLowerCase().includes('daemonset');
    
    // For NEW collectors: Include CRD settings if name AND namespace provided
    // For EXISTING collectors: Include CRD settings if it's Deployment or StatefulSet (DaemonSet only sends spec.config)
    const isNewCollector = Boolean(crdSettings.name && crdSettings.namespace);
    const canModifyDeploymentSettings = Boolean(!isDaemonSet && selectedAgentUID); // Deployment/StatefulSet can be modified

    const crdValidationErrors = validateCRDSettings({
      includeDeploymentSettings,
      crdSettings,
      isNewCollector,
      canModifyDeploymentSettings,
    });
    invalidComponents.push(...crdValidationErrors);
    
    if (invalidComponents.length > 0) {
      alert('Invalid configuration:\n\n' + invalidComponents.join('\n') + '\n\nPlease ensure all components have a valid type.');
      return;
    }
    
    try {
      const response = await backendSrv.post(
        '/api/plugins/otel-collector-agent-fleet-management/resources/config-generator',
        { 
          receivers, 
          processors, 
          exporters, 
          service: { 
            selectedSignals: Object.entries(selectedSignals)
              .filter(([_, selected]) => selected)
              .map(([signal, _]) => signal)
          },
          // Include CRD settings only when the user opts-in AND it's permitted for this collector
          // 1. NEW collectors (name + namespace provided)
          // 2. EXISTING Deployment/StatefulSet collectors (deployment settings can be modified)
          // Do NOT include for DaemonSet collectors (only spec.config is updated)
          crdSettings: (isAdmin && includeDeploymentSettings && (isNewCollector || canModifyDeploymentSettings)) ? {
            name: crdSettings.name,
            namespace: crdSettings.namespace,
            mode: crdSettings.mode,
            replicas: (crdSettings.mode === 'deployment' || crdSettings.mode === 'statefulset') ? crdSettings.replicas : undefined,
            image: crdSettings.image,
            managementState: crdSettings.managementState,
            upgradeStrategy: crdSettings.upgradeStrategy,
            resources: crdSettings.resources,
            advancedYaml: crdSettings.advancedYaml || undefined
          } : undefined
        }
      );
      const generated = typeof response.config === 'string' ? response.config : '';
      if (!generated.trim()) {
        alert('The config generator did not return any YAML. Please verify that you have at least one receiver and exporter configured.');
      }
      setGeneratedConfig(generated);
    } catch (err: any) {
      alert('Failed to generate config: ' + (err.message || 'Unknown error'));
    }
  };

  // Load component types from backend
  const loadComponentTypes = async () => {
    try {
      const [receiversRes, processorsRes, exportersRes] = await Promise.all([
        backendSrv.get('/api/plugins/otel-collector-agent-fleet-management/resources/component-types?category=receiver'),
        backendSrv.get('/api/plugins/otel-collector-agent-fleet-management/resources/component-types?category=processor'),
        backendSrv.get('/api/plugins/otel-collector-agent-fleet-management/resources/component-types?category=exporter')
      ]);
      
      const receiversList = (receiversRes.items || []).map((t: any) => ({
        value: t.type,
        label: t.label,
        config: t.config || {},
        description: t.description,
        isSystem: t.isSystem,
        isCustom: t.isCustom,
        id: t.id,
      }));
      const processorsList = (processorsRes.items || []).map((t: any) => ({
        value: t.type,
        label: t.label,
        config: t.config || {},
        description: t.description,
        isSystem: t.isSystem,
        isCustom: t.isCustom,
        id: t.id,
      }));
      const exportersList = (exportersRes.items || []).map((t: any) => ({
        value: t.type,
        label: t.label,
        config: t.config || {},
        description: t.description,
        isSystem: t.isSystem,
        isCustom: t.isCustom,
        id: t.id,
      }));

      setReceiverTypes(mergeComponentTypeLists(receiversList, builtinReceiverTemplates));
      setProcessorTypes(mergeComponentTypeLists(processorsList, builtinProcessorTemplates));
      setExporterTypes(mergeComponentTypeLists(exportersList, builtinExporterTemplates));
    } catch (err: any) {
      console.error('Failed to load component types:', err);
    }
  };

  useEffect(() => {
    loadComponentTypes();
    loadTemplates();
  }, []);

  // Get types based on category
  const getTypesForCategory = (category: 'receiver' | 'processor' | 'exporter') => {
    switch (category) {
      case 'receiver': return receiverTypes;
      case 'processor': return processorTypes;
      case 'exporter': return exporterTypes;
    }
  };

  const addComponent = (category: 'receiver' | 'processor' | 'exporter') => {
    const types = getTypesForCategory(category);
    const defaultType = types.length > 0 ? types[0] : { value: 'custom', label: 'Custom', config: {} };
    
    // Generate a better component name: use type + index (e.g., "debug_1", "otlp_1")
    // But fallback to category_index if type is custom
    const componentIndex = category === 'receiver' ? receivers.length + 1 : category === 'processor' ? processors.length + 1 : exporters.length + 1;
    const componentName = defaultType.value !== 'custom' 
      ? `${defaultType.value}_${componentIndex}` 
      : `${category}_${componentIndex}`;
    
    const newComponent: any = {
      name: componentName,
      type: defaultType.value,
      ...(defaultType.config || {})
    };
    
    if (category === 'receiver') {
      setReceivers([...receivers, newComponent]);
      const newKey = `${category}-${receivers.length}`;
      setExpandedComponents(new Set([...expandedComponents, newKey]));
    } else if (category === 'processor') {
      setProcessors([...processors, newComponent]);
      const newKey = `${category}-${processors.length}`;
      setExpandedComponents(new Set([...expandedComponents, newKey]));
    } else {
      setExporters([...exporters, newComponent]);
      const newKey = `${category}-${exporters.length}`;
      setExpandedComponents(new Set([...expandedComponents, newKey]));
    }
  };

  const removeComponent = (type: 'receiver' | 'processor' | 'exporter', index: number) => {
    if (type === 'receiver') {
      setReceivers(receivers.filter((_, i) => i !== index));
    } else if (type === 'processor') {
      setProcessors(processors.filter((_, i) => i !== index));
    } else {
      setExporters(exporters.filter((_, i) => i !== index));
    }
    const key = `${type}-${index}`;
    const newExpanded = new Set(expandedComponents);
    newExpanded.delete(key);
    setExpandedComponents(newExpanded);
  };

  const updateComponent = (type: 'receiver' | 'processor' | 'exporter', index: number, updates: any) => {
    if (type === 'receiver') {
      const updated = [...receivers];
      updated[index] = { ...updated[index], ...updates };
      setReceivers(updated);
    } else if (type === 'processor') {
      const updated = [...processors];
      updated[index] = { ...updated[index], ...updates };
      setProcessors(updated);
    } else {
      const updated = [...exporters];
      updated[index] = { ...updated[index], ...updates };
      setExporters(updated);
    }
  };

  const toggleExpand = (key: string) => {
    const newExpanded = new Set(expandedComponents);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedComponents(newExpanded);
  };

  const changeComponentType = (category: 'receiver' | 'processor' | 'exporter', index: number, newType: string) => {
    const types = getTypesForCategory(category);
    const template = types.find((t: any) => t.value === newType);
    
    if (newType === 'custom') {
      // Handle custom type - initialize with empty customYaml
      if (category === 'receiver') {
        const updated = [...receivers];
        updated[index] = { name: updated[index].name, type: 'custom', customYaml: '' };
        setReceivers(updated);
      } else if (category === 'processor') {
        const updated = [...processors];
        updated[index] = { name: updated[index].name, type: 'custom', customYaml: '' };
        setProcessors(updated);
      } else {
        const updated = [...exporters];
        updated[index] = { name: updated[index].name, type: 'custom', customYaml: '' };
        setExporters(updated);
      }
      return;
    }
    
    if (template) {
      if (category === 'receiver') {
        const updated = [...receivers];
        updated[index] = { name: updated[index].name, type: newType, ...(template.config || {}) };
        setReceivers(updated);
      } else if (category === 'processor') {
        const updated = [...processors];
        updated[index] = { name: updated[index].name, type: newType, ...(template.config || {}) };
        setProcessors(updated);
      } else {
        const updated = [...exporters];
        updated[index] = { name: updated[index].name, type: newType, ...(template.config || {}) };
        setExporters(updated);
      }
    }
  };
  const renderComponentEditor = (comp: any, type: 'receiver' | 'processor' | 'exporter', index: number) => {
    const key = `${type}-${index}`;
    const isExpanded = expandedComponents.has(key);

    return (
      <div key={index} style={{ marginBottom: 12, border: '1px solid #E5E7EB', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ 
          padding: 12, 
          background: isExpanded ? '#F9FAFB' : 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer'
        }} onClick={() => toggleExpand(key)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 2 }}>
              {comp.name || `${type}_${index + 1}`}
            </div>
            <div style={{ fontSize: 11, color: '#6B7280' }}>{comp.type}</div>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeComponent(type, index);
              }}
              style={{
                padding: '4px 8px',
                background: '#EF4444',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 500
              }}
            >
              Delete
            </button>
            <span style={{ fontSize: 14, color: '#6B7280' }}>{isExpanded ? '▼' : '▶'}</span>
          </div>
        </div>
        {isExpanded && (
          <div style={{ padding: 12, background: 'white', borderTop: '1px solid #E5E7EB' }}>
            {/* Component Name */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#6B7280' }}>Name</label>
              <input
                type="text"
                value={comp.name || ''}
                onChange={(e) => updateComponent(type, index, { name: e.target.value })}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 13 }}
              />
            </div>
            
            {/* Component Type */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#6B7280' }}>Type</label>
              <select
                value={comp.type}
                onChange={(e) => changeComponentType(type, index, e.target.value)}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 13 }}
              >
                {getTypesForCategory(type).map((t: any) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Type-specific configuration */}
            {comp.type === 'otlp' && type === 'receiver' && (
              <>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#6B7280' }}>gRPC Endpoint</label>
                  <input
                    type="text"
                    value={comp.protocols?.grpc?.endpoint || '0.0.0.0:4317'}
                    onChange={(e) => {
                      const updated = { ...comp };
                      if (!updated.protocols) updated.protocols = {};
                      if (!updated.protocols.grpc) updated.protocols.grpc = {};
                      updated.protocols.grpc.endpoint = e.target.value;
                      updateComponent(type, index, updated);
                    }}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 13 }}
                  />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#6B7280' }}>HTTP Endpoint</label>
                  <input
                    type="text"
                    value={comp.protocols?.http?.endpoint || '0.0.0.0:4318'}
                    onChange={(e) => {
                      const updated = { ...comp };
                      if (!updated.protocols) updated.protocols = {};
                      if (!updated.protocols.http) updated.protocols.http = {};
                      updated.protocols.http.endpoint = e.target.value;
                      updateComponent(type, index, updated);
                    }}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 13 }}
                  />
                </div>
              </>
            )}

            {comp.type === 'otlp' && type === 'exporter' && (
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#6B7280' }}>Endpoint</label>
                <input
                  type="text"
                  value={comp.endpoint || 'http://localhost:4317'}
                  onChange={(e) => updateComponent(type, index, { endpoint: e.target.value })}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 13 }}
                />
              </div>
            )}

            {comp.type === 'batch' && type === 'processor' && (
              <>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#6B7280' }}>Batch Size</label>
                  <input
                    type="number"
                    value={comp.send_batch_size || 1024}
                    onChange={(e) => updateComponent(type, index, { send_batch_size: parseInt(e.target.value) || 1024 })}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 13 }}
                  />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#6B7280' }}>Timeout</label>
                  <input
                    type="text"
                    value={comp.timeout || '10s'}
                    onChange={(e) => updateComponent(type, index, { timeout: e.target.value })}
                    placeholder="10s, 1m, etc"
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 13 }}
                  />
                </div>
              </>
            )}

            {comp.type === 'memory_limiter' && type === 'processor' && (
              <>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#6B7280' }}>Limit (MiB)</label>
                  <input
                    type="number"
                    value={comp.limit_mib || 512}
                    onChange={(e) => updateComponent(type, index, { limit_mib: parseInt(e.target.value) || 512 })}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 13 }}
                  />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#6B7280' }}>Spike Limit (MiB)</label>
                  <input
                    type="number"
                    value={comp.spike_limit_mib || 128}
                    onChange={(e) => updateComponent(type, index, { spike_limit_mib: parseInt(e.target.value) || 128 })}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 13 }}
                  />
                </div>
              </>
            )}

            {comp.type === 'filelog' && type === 'receiver' && (
              <>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#6B7280' }}>Include Paths (one per line, glob patterns)</label>
                  <textarea
                    value={Array.isArray(comp.include) ? comp.include.join('\n') : comp.include || ''}
                    onChange={(e) => {
                      const lines = e.target.value.split('\n').filter(l => l.trim());
                      updateComponent(type, index, { include: lines.length > 0 ? lines : [] });
                    }}
                    placeholder="/var/log/**/*.log&#10;/tmp/**/*.log"
                    rows={4}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}
                  />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#6B7280' }}>Exclude Paths (one per line, glob patterns)</label>
                  <textarea
                    value={Array.isArray(comp.exclude) ? comp.exclude.join('\n') : comp.exclude || ''}
                    onChange={(e) => {
                      const lines = e.target.value.split('\n').filter(l => l.trim());
                      updateComponent(type, index, { exclude: lines.length > 0 ? lines : [] });
                    }}
                    placeholder="/var/log/**/*.tmp&#10;/tmp/**/debug.log"
                    rows={4}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}
                  />
                </div>
              </>
            )}

            {/* Custom YAML Editor - Always shown for custom type, otherwise shown as advanced option */}
            {comp.type === 'custom' ? (
              <div style={{ marginTop: 12, padding: 12, background: '#FEF3C7', borderRadius: 6, border: '2px solid #FCD34D' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#92400E' }}>
                  ⚙️ Custom YAML Configuration
                  {comp._isExtension && comp._sectionName && (
                    <span style={{ fontSize: 10, marginLeft: 8, color: '#78350F', fontWeight: 400 }}>
                      (Extension: {comp._sectionName})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#78350F', marginBottom: 8 }}>
                  {comp._isExtension ? (
                    <>This is a custom section (like extensions) that doesn't fit into standard receivers/processors/exporters. It will be preserved in the generated config as the "{comp._sectionName}" section.</>
                  ) : (
                    <>Enter your complete component configuration in YAML format. The component name "{comp.name || `${type}_${index + 1}`}" will be added automatically in the generated config.</>
                  )}
                </div>
                <textarea
                  value={comp.customYaml || ''}
                  onChange={(e) => {
                    updateComponent(type, index, { ...comp, customYaml: e.target.value });
                  }}
                  placeholder={comp._isExtension ? `# Custom section: ${comp._sectionName}\n# Enter YAML configuration for this section\n# Example:\n${comp._sectionName}:\n  key: value` : `# Enter your ${type} YAML configuration here\n# Example:\nendpoint: http://localhost:4317\ntls:\n  insecure: true\nheaders:\n  authorization: "Bearer token"`}
                  style={{
                    width: '100%',
                    minHeight: 300,
                    fontFamily: 'monospace',
                    fontSize: 12,
                    padding: 12,
                    border: '2px solid #F59E0B',
                    borderRadius: 4,
                    background: 'white',
                    color: '#111827',
                    resize: 'vertical'
                  }}
                />
                <div style={{ fontSize: 11, color: '#92400E', marginTop: 8 }}>
                  💡 <strong>Tip:</strong> This YAML will be merged into the final OpenTelemetry Collector configuration as-is. Make sure the syntax is valid YAML.
                </div>
              </div>
            ) : (
              /* Raw YAML Editor for non-custom types (Advanced) */
              <div style={{ marginTop: 12, padding: 8, background: '#F9FAFB', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, marginBottom: 4, color: '#6B7280' }}>
                  Advanced: Edit Full YAML Config
                </label>
                <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 8 }}>
                  Edit the complete component configuration. Changes here override the form fields above.
                </div>
                <textarea
                  value={yaml.dump(comp, { indent: 2, lineWidth: -1, skipInvalid: true })}
                  onChange={(e) => {
                    try {
                      const parsed = yaml.load(e.target.value) as any;
                      if (parsed && typeof parsed === 'object') {
                        updateComponent(type, index, parsed);
                      }
                    } catch (err: any) {
                      // Show error in console but don't block editing
                      console.error('Invalid YAML:', err.message);
                    }
                  }}
                  style={{
                    width: '100%',
                    minHeight: 150,
                    fontFamily: 'monospace',
                    fontSize: 11,
                    padding: 8,
                    border: '1px solid #D1D5DB',
                    borderRadius: 4,
                    background: 'white',
                    resize: 'vertical'
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
  return (
    <div>
      {!canEditConfig && <div role="status" style={{ marginBottom: 12, padding: 12, background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: 6 }}>
        Viewer access is read-only. Editors can save configuration drafts; a Grafana Admin must approve them before they can be pushed.
      </div>}
      <div style={{
        background: 'white',
        borderRadius: 8,
        border: '1px solid #E5E7EB',
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>Configuration Builder</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={!canEditConfig}
              onClick={() => setShowComponentTypeManager(true)}
              style={{
                padding: '8px 16px',
                background: '#8B5CF6',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500
              }}
            >
              ⚙️ Manage Component Types
            </button>
          </div>
        </div>

        {savedTemplates.length > 0 && (
          <div style={{ marginBottom: 20, padding: 12, background: '#F3F4F6', borderRadius: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#6B7280' }}>Saved Templates</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {savedTemplates.map((t: any) => (
                <div key={t.id} style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '6px 12px', background: 'white', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</span>
                  <button 
                    onClick={() => loadTemplate(t)} 
                    style={{ padding: '2px 8px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}
                  >
                    Load
                  </button>
                  <button 
                    onClick={() => deleteTemplate(t.id)} 
                    disabled={deletingTemplateId === t.id}
                    style={{ 
                      padding: '2px 8px', 
                      background: deletingTemplateId === t.id ? '#9CA3AF' : '#EF4444', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: 3, 
                      cursor: deletingTemplateId === t.id ? 'not-allowed' : 'pointer', 
                      fontSize: 11 
                    }}
                  >
                    {deletingTemplateId === t.id ? 'Deleting...' : '×'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* Mode Selector - Raw YAML vs Form-based */}
        <div style={{ marginBottom: 24, padding: 16, background: '#F9FAFB', borderRadius: 6, border: '1px solid #E5E7EB' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#111827' }}>
            🔧 Configuration Mode
          </label>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button
              onClick={() => {
                if (useRawYAML) {
                  const source = rawYAMLConfig.trim() || generatedConfig;
                  if (source) {
                    const ok = parseConfigYAML(source);
                    if (!ok) {
                      return;
                    }
                  }
                }
                setUseRawYAML(false);
              }}
              style={{
                padding: '10px 20px',
                background: !useRawYAML ? '#3B82F6' : '#F3F4F6',
                color: !useRawYAML ? 'white' : '#6B7280',
                border: `2px solid ${!useRawYAML ? '#3B82F6' : '#E5E7EB'}`,
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
            >
              📝 Form-based Editor
            </button>
            <button
              onClick={() => {
                setUseRawYAML(true);
                if (!useRawYAML && generatedConfig) {
                  setRawYAMLConfig(generatedConfig);
                }
              }}
              style={{
                padding: '10px 20px',
                background: useRawYAML ? '#10B981' : '#F3F4F6',
                color: useRawYAML ? 'white' : '#6B7280',
                border: `2px solid ${useRawYAML ? '#10B981' : '#E5E7EB'}`,
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
            >
              ⚡ Raw YAML Editor (Direct)
            </button>
          </div>
          {useRawYAML && (
            <div style={{ marginTop: 12, padding: 12, background: '#FEF3C7', borderRadius: 6, border: '2px solid #FCD34D' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#92400E' }}>
                ⚡ Raw YAML Mode Active
              </div>
              <div style={{ fontSize: 11, color: '#78350F' }}>
                You can directly edit the OpenTelemetry Collector YAML configuration. This will bypass the form-based editor and sync directly to the agent after approval.
              </div>
            </div>
          )}
        </div>

        {/* Signal Selection - Select which telemetry signals to generate */}
        {!useRawYAML && (
          <div style={{ marginBottom: 24, padding: 16, background: '#F0F9FF', borderRadius: 6, border: '1px solid #93C5FD' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#1E40AF' }}>
              📊 Select Telemetry Signals
            </label>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {(['logs', 'metrics', 'traces'] as const).map((signal) => {
                const availableSignals = getAvailableSignals();
                const isAvailable = availableSignals[signal];
                const isSelected = selectedSignals[signal];
                const signalLabel = signal.charAt(0).toUpperCase() + signal.slice(1);
                
                return (
                  <label
                    key={signal}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: isAvailable ? 'pointer' : 'not-allowed',
                      opacity: isAvailable ? 1 : 0.5,
                      padding: '8px 12px',
                      background: isSelected ? '#DBEAFE' : 'white',
                      borderRadius: 6,
                      border: `2px solid ${isSelected ? '#3B82F6' : '#D1D5DB'}`,
                      fontSize: 13,
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? '#1E40AF' : '#6B7280'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!isAvailable}
                      onChange={(e) => {
                        if (isAvailable) {
                          setSelectedSignals(prev => ({ ...prev, [signal]: e.target.checked }));
                        }
                      }}
                      style={{ cursor: isAvailable ? 'pointer' : 'not-allowed' }}
                    />
                    <span>{signalLabel}</span>
                    {!isAvailable && (
                      <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 4 }}>
                        (not compatible)
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: '#6B7280' }}>
              {(() => {
                const available = getAvailableSignals();
                const availableCount = Object.values(available).filter(v => v).length;
                if (availableCount === 0) {
                  return '⚠️ No signals are compatible with your selected components. Please add compatible receivers, processors, and exporters.';
                }
                const selectedCount = Object.values(selectedSignals).filter(v => v).length;
                if (selectedCount === 0) {
                  return '⚠️ Please select at least one signal to generate a configuration.';
                }
                return `ℹ️ ${selectedCount} signal(s) selected. Only compatible signals are enabled based on your component selection.`;
              })()}
            </div>
          </div>
        )}
        {/* CRD Settings - Deployment Configuration */}
        {!useRawYAML && false && (() => {
          // Check if selected agent is a DaemonSet collector
          const selectedAgent = agents.find((a: Agent) => a.agentUid === selectedAgentUID);
          const isDaemonSet = selectedAgent?.labels?.['k8s.crd_name']?.toLowerCase().includes('daemonset') || 
                              selectedAgent?.name?.toLowerCase().includes('daemonset');
          
          // If editing an existing collector (selectedAgentUID set), suppress deployment controls entirely.
          if (selectedAgentUID) {
            return (
              <div style={{ marginBottom: 24, padding: 16, background: '#F3F4F6', borderRadius: 6, border: '1px solid #D1D5DB', color: '#4B5563', fontSize: 12 }}>
                ℹ️ Deployment (CRD) settings are managed directly in Kubernetes. This UI only manages <code>spec.config</code> pushed over OpAMP. To change replicas, resources, images, or autoscaler settings, update the `OpenTelemetryCollector` CRD manually.
              </div>
            );
          }
          
          // Hide deployment settings for DaemonSet collectors (they don't support remote config)
          if (isDaemonSet) {
            return (
              <div style={{ marginBottom: 24, padding: 16, background: '#FEE2E2', borderRadius: 6, border: '1px solid #FCA5A5' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#991B1B', marginBottom: 8 }}>
                  ⚠️ Deployment Settings Not Available
                </div>
                <div style={{ fontSize: 12, color: '#7F1D1D' }}>
                  This collector is in <strong>DaemonSet mode</strong>, which does not support remote configuration updates via OpAMP.
                  Only the pipeline configuration (receivers, processors, exporters) can be modified.
                  Deployment settings (mode, replicas, resources) cannot be changed remotely.
                </div>
              </div>
            );
          }
          
          return (
            <div style={{ marginBottom: 24, padding: 16, background: '#FEF3C7', borderRadius: 6, border: '1px solid #FCD34D' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>
                  ⚙️ Deployment Settings (OpenTelemetryCollector CRD)
                </label>
                <button
                  onClick={() => setShowCRDSettings(!showCRDSettings)}
                  style={{
                    padding: '6px 12px',
                    background: '#FBBF24',
                    color: '#78350F',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  {showCRDSettings ? '▼ Hide' : '▶ Show'}
                </button>
              </div>
              
              {!selectedAgentUID && (
                <div style={{ marginBottom: 12, padding: 10, background: '#FDE68A', borderRadius: 4, fontSize: 12, color: '#78350F' }}>
                  ℹ️ <strong>Note:</strong> Deployment settings are only used when creating <strong>NEW collectors</strong> (provide Name and Namespace).
                  For existing collectors, only the pipeline configuration will be updated.
                </div>
              )}
              
              {selectedAgentUID && (
                <div style={{ marginBottom: 12, padding: 10, background: '#D1FAE5', borderRadius: 4, fontSize: 12, color: '#065F46' }}>
                  ℹ️ <strong>Updating existing collector:</strong> Deployment settings below can be modified for <strong>Deployment</strong> and <strong>StatefulSet</strong> collectors.
                  Both pipeline configuration (receivers, processors, exporters) and deployment settings will be sent to the collector.
                  To create a NEW collector, clear the agent selection and provide Name + Namespace.
                </div>
              )}
            
            {showCRDSettings && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
                {/* Name (Optional - for NEW collectors) */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#78350F' }}>
                    Name <span style={{ fontSize: 10, color: '#92400E' }}>(optional for updates)</span>
                  </label>
                  <input
                    type="text"
                    value={crdSettings.name}
                    onChange={(e) => setCrdSettings({ ...crdSettings, name: e.target.value })}
                    placeholder="my-collector"
                    style={{ width: '100%', padding: '8px', border: '1px solid #FCD34D', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}
                  />
                </div>

                {/* Namespace (Optional - for NEW collectors) */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#78350F' }}>
                    Namespace <span style={{ fontSize: 10, color: '#92400E' }}>(optional for updates)</span>
                  </label>
                  <input
                    type="text"
                    value={crdSettings.namespace}
                    onChange={(e) => setCrdSettings({ ...crdSettings, namespace: e.target.value })}
                    placeholder="opentelemetry-operator-system"
                    style={{ width: '100%', padding: '8px', border: '1px solid #FCD34D', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}
                  />
                </div>

                {/* Mode */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#78350F' }}>
                    Deployment Mode
                  </label>
                  <select
                    value={crdSettings.mode}
                    onChange={(e) => setCrdSettings({ ...crdSettings, mode: e.target.value as any })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #FCD34D', borderRadius: 4, fontSize: 13 }}
                  >
                    <option value="deployment">Deployment</option>
                    <option value="daemonset">DaemonSet</option>
                    <option value="statefulset">StatefulSet</option>
                    <option value="sidecar">Sidecar</option>
                  </select>
                </div>

                {/* Replicas */}
                {(crdSettings.mode === 'deployment' || crdSettings.mode === 'statefulset') && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#78350F' }}>
                      Replicas
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={crdSettings.replicas}
                      onChange={(e) => setCrdSettings({ ...crdSettings, replicas: parseInt(e.target.value) || 1 })}
                      style={{ width: '100%', padding: '8px', border: '1px solid #FCD34D', borderRadius: 4, fontSize: 13 }}
                    />
                  </div>
                )}

                {/* Image */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#78350F' }}>
                    Container Image
                  </label>
                  <input
                    type="text"
                    value={crdSettings.image}
                    onChange={(e) => setCrdSettings({ ...crdSettings, image: e.target.value })}
                    placeholder="otel/opentelemetry-collector-contrib:latest"
                    style={{ width: '100%', padding: '8px', border: '1px solid #FCD34D', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}
                  />
                </div>

                {/* Management State */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#78350F' }}>
                    Management State
                  </label>
                  <select
                    value={crdSettings.managementState}
                    onChange={(e) => setCrdSettings({ ...crdSettings, managementState: e.target.value as any })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #FCD34D', borderRadius: 4, fontSize: 13 }}
                  >
                    <option value="managed">Managed</option>
                    <option value="unmanaged">Unmanaged</option>
                  </select>
                </div>

                {/* Upgrade Strategy */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#78350F' }}>
                    Upgrade Strategy
                  </label>
                  <select
                    value={crdSettings.upgradeStrategy}
                    onChange={(e) => setCrdSettings({ ...crdSettings, upgradeStrategy: e.target.value as any })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #FCD34D', borderRadius: 4, fontSize: 13 }}
                  >
                    <option value="automatic">Automatic</option>
                    <option value="none">None</option>
                  </select>
                </div>

                {/* Resources Section Header */}
                <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 12 }}>
                    📊 Resource Limits & Requests
                  </h4>
                </div>

                {/* CPU Request */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#78350F' }}>
                    CPU Request
                  </label>
                  <input
                    type="text"
                    value={crdSettings.resources.requests.cpu}
                    onChange={(e) => setCrdSettings({
                      ...crdSettings,
                      resources: {
                        ...crdSettings.resources,
                        requests: { ...crdSettings.resources.requests, cpu: e.target.value }
                      }
                    })}
                    placeholder="200m"
                    style={{ width: '100%', padding: '8px', border: '1px solid #FCD34D', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}
                  />
                </div>

                {/* CPU Limit */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#78350F' }}>
                    CPU Limit
                  </label>
                  <input
                    type="text"
                    value={crdSettings.resources.limits.cpu}
                    onChange={(e) => setCrdSettings({
                      ...crdSettings,
                      resources: {
                        ...crdSettings.resources,
                        limits: { ...crdSettings.resources.limits, cpu: e.target.value }
                      }
                    })}
                    placeholder="1000m"
                    style={{ width: '100%', padding: '8px', border: '1px solid #FCD34D', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}
                  />
                </div>

                {/* Memory Request */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#78350F' }}>
                    Memory Request
                  </label>
                  <input
                    type="text"
                    value={crdSettings.resources.requests.memory}
                    onChange={(e) => setCrdSettings({
                      ...crdSettings,
                      resources: {
                        ...crdSettings.resources,
                        requests: { ...crdSettings.resources.requests, memory: e.target.value }
                      }
                    })}
                    placeholder="256Mi"
                    style={{ width: '100%', padding: '8px', border: '1px solid #FCD34D', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}
                  />
                </div>

                {/* Memory Limit */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#78350F' }}>
                    Memory Limit
                  </label>
                  <input
                    type="text"
                    value={crdSettings.resources.limits.memory}
                    onChange={(e) => setCrdSettings({
                      ...crdSettings,
                      resources: {
                        ...crdSettings.resources,
                        limits: { ...crdSettings.resources.limits, memory: e.target.value }
                      }
                    })}
                    placeholder="1Gi"
                    style={{ width: '100%', padding: '8px', border: '1px solid #FCD34D', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}
                  />
                </div>

                {/* Advanced YAML - for custom fields */}
                <div style={{ gridColumn: '1 / -1', marginTop: 16, padding: 12, background: '#FFFBF0', borderRadius: 6, border: '1px solid #FCD34D' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, color: '#92400E', margin: 0 }}>
                      🔧 Advanced Configuration (YAML)
                    </h4>
                    <button
                      onClick={() => {
                        // Clear advanced YAML
                        if (crdSettings.advancedYaml) {
                          if (confirm('Clear advanced YAML configuration?')) {
                            setCrdSettings({ ...crdSettings, advancedYaml: '' });
                          }
                        }
                      }}
                      style={{
                        padding: '4px 8px',
                        background: crdSettings.advancedYaml ? '#FCA5A5' : '#E5E7EB',
                        color: crdSettings.advancedYaml ? '#991B1B' : '#6B7280',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 500
                      }}
                      disabled={!crdSettings.advancedYaml}
                    >
                      Clear
                    </button>
                  </div>
                  
                  <div style={{ fontSize: 11, color: '#78350F', marginBottom: 12, padding: 8, background: '#FEF9E7', borderRadius: 4 }}>
                    ℹ️ Add advanced fields like <code style={{ background: '#FCD34D', padding: '2px 4px', borderRadius: 2 }}>targetAllocator</code>, <code style={{ background: '#FCD34D', padding: '2px 4px', borderRadius: 2 }}>volumes</code>, <code style={{ background: '#FCD34D', padding: '2px 4px', borderRadius: 2 }}>volumeMounts</code>, <code style={{ background: '#FCD34D', padding: '2px 4px', borderRadius: 2 }}>serviceAccount</code>, <code style={{ background: '#FCD34D', padding: '2px 4px', borderRadius: 2 }}>env</code>, <code style={{ background: '#FCD34D', padding: '2px 4px', borderRadius: 2 }}>ports</code>, <code style={{ background: '#FCD34D', padding: '2px 4px', borderRadius: 2 }}>tolerations</code>, <code style={{ background: '#FCD34D', padding: '2px 4px', borderRadius: 2 }}>nodeSelector</code>, etc.
                  </div>
                  
                  {/* Show current YAML in a readable format */}
                  {crdSettings.advancedYaml && (
                    <div style={{ marginBottom: 12, padding: 8, background: '#F9FAFB', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Current Advanced YAML:</div>
                      <pre style={{ 
                        margin: 0, 
                        padding: 8, 
                        background: '#F3F4F6', 
                        borderRadius: 4, 
                        fontSize: 11, 
                        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                        color: '#111827',
                        overflowX: 'auto',
                        maxHeight: '150px',
                        overflowY: 'auto'
                      }}>
                        {crdSettings.advancedYaml}
                      </pre>
                    </div>
                  )}
                  
                  <textarea
                    value={crdSettings.advancedYaml}
                    onChange={(e) => setCrdSettings({ ...crdSettings, advancedYaml: e.target.value })}
                    placeholder={`# Example: Target Allocator for Prometheus
targetAllocator:
  enabled: true
  serviceAccount: opentelemetry-targetallocator-sa
  prometheusCR:
    enabled: true

# Example: Volumes
volumes:
  - name: varlog
    hostPath:
      path: /var/log

volumeMounts:
  - name: varlog
    mountPath: /var/log
    readOnly: true

# Example: Environment variables
env:
  - name: MY_ENV_VAR
    value: "my-value"
# Example: ServiceAccount
serviceAccount: my-service-account
# Example: Tolerations
tolerations:
  - key: node.kubernetes.io/disk-pressure
    operator: Exists
    effect: NoSchedule`}
                    style={{
                      width: '100%',
                      minHeight: '200px',
                      padding: '10px',
                      border: '1px solid #FCD34D',
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                      background: '#FFFFFF',
                      resize: 'vertical'
                    }}
                  />
                  <div style={{ fontSize: 10, color: '#78350F', marginTop: 8 }}>
                    💡 This YAML will be merged into the <code>spec</code> section. See <a href="https://github.com/open-telemetry/opentelemetry-operator/blob/main/docs/api.md" target="_blank" rel="noopener" style={{ color: '#D97706', textDecoration: 'underline' }}>OpenTelemetry Operator API docs</a> for all available fields.
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: 12, fontSize: 11, color: '#78350F' }}>
              ℹ️ These settings control how the OpenTelemetry Collector is deployed in Kubernetes. The pipeline configuration (receivers, processors, exporters) will be merged into `spec.config`.
            </div>
            </div>
          );
        })()}

        {!useRawYAML && (
          <div style={{ marginBottom: 24, padding: 16, background: '#F3F4F6', borderRadius: 6, border: '1px solid #D1D5DB', color: '#4B5563', fontSize: 12 }}>
            ℹ️ Deployment (CRD) settings must be updated directly in Kubernetes. This generator only manages the collector's <code>spec.config</code> that OpAMP can push.
          </div>
        )}

        {/* Agent Selector - Hierarchical Bridge/Collector Structure */}
        {/* Fix 3: Only show collectors, not bridges - bridges are management agents and cannot receive collector configurations */}
        <div style={{ marginBottom: 24, padding: 16, background: '#F9FAFB', borderRadius: 6, border: '1px solid #E5E7EB' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#111827' }}>
            📍 Select Agent / Collector (Required for saving configuration)
          </label>
          {/* Warning about bridges */}
          {bridges.length > 0 && (
            <div style={{ marginBottom: 12, padding: '10px 12px', background: '#FEF3C7', borderRadius: 4, border: '1px solid #FCD34D', fontSize: 12, color: '#92400E' }}>
              ⚠️ <strong>Note:</strong> Bridges are management agents and cannot receive collector configurations. Only collectors are shown below.
            </div>
          )}
          {bridges.length > 0 ? (
            <div style={{ border: '1px solid #D1D5DB', borderRadius: 6, background: 'white', maxHeight: '400px', overflowY: 'auto' }}>
              {bridges.map(bridge => {
                const bridgeCollectors = bridge.collectors || [];
                const isExpanded = expandedGroups.has(`config-${bridge.agentUid}`);
                // Fix 3: Don't show bridge option - only show collectors
                if (bridgeCollectors.length === 0) {
                  return null; // Skip bridges with no collectors
                }
                return (
                  <div key={bridge.agentUid} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    {/* Bridge Header (no selection, just expand/collapse) */}
                    <div
                      onClick={() => {
                        const newExpanded = new Set(expandedGroups);
                        if (isExpanded) {
                          newExpanded.delete(`config-${bridge.agentUid}`);
                        } else {
                          newExpanded.add(`config-${bridge.agentUid}`);
                        }
                        setExpandedGroups(newExpanded);
                      }}
                      style={{
                        padding: '12px 16px',
                        background: isExpanded ? '#F3F4F6' : '#F9FAFB',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        borderLeft: '2px solid #E5E7EB'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#F3F4F6';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isExpanded ? '#F3F4F6' : '#F9FAFB';
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{agent.name || agent.agentUid}</span>
                        {getStatusBadge(agent.status)}
                        {agent.version && <span style={{ fontSize: 11, color: '#6B7280' }}>v{agent.version}</span>}
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
                background: selectedAgentUID ? 'white' : '#FEF3C7'
              }}
            >
              <option value="">
                {agents.length === 0 ? '-- No agents available --' : '-- Select an agent/collector first --'}
              </option>
              {agents.map(a => (
                <option key={a.agentUid} value={a.agentUid}>
                  {a.name || a.agentUid} ({a.status}) {a.version ? `v${a.version}` : ''}
                </option>
              ))}
            </select>
          )}
          {(() => {
            // Fix 3: Check if selected agent is a bridge
            const selectedIsBridge = bridges.some(b => b.agentUid === selectedAgentUID);
            
            if (!selectedAgentUID) {
              return (
                <div style={{ marginTop: 8, fontSize: 12, color: '#78350F', padding: 8, background: '#FEF3C7', borderRadius: 4 }}>
                  ⚠️ <strong>Important:</strong> You must select a collector before generating or saving a configuration. Bridges are management agents and cannot receive collector configurations.
                </div>
              );
            }
            if (selectedIsBridge) {
              return (
                <div style={{ marginTop: 8, fontSize: 12, color: '#991B1B', padding: 8, background: '#FEE2E2', borderRadius: 4 }}>
                  ❌ <strong>Error:</strong> Bridges cannot receive collector configurations. Please select a collector instead.
                </div>
              );
            }
            return (
              <div style={{ marginTop: 8, fontSize: 12, color: '#065F46', padding: 8, background: '#D1FAE5', borderRadius: 4 }}>
                ✓ Collector selected. You can now generate, edit, and save configurations for this collector.
              </div>
            );
          })()}
        </div>

        {!useRawYAML && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: 16, background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#3B82F6' }}>Receivers ({receivers.length})</h4>
              <button onClick={() => addComponent('receiver')} style={{ padding: '4px 8px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>+ Add</button>
            </div>
            {receivers.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: 20 }}>No receivers added</div>
            ) : (
              <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                {receivers.map((rec, idx) => renderComponentEditor(rec, 'receiver', idx))}
              </div>
            )}
          </div>

          <div style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: 16, background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#10B981' }}>Processors ({processors.length})</h4>
              <button onClick={() => addComponent('processor')} style={{ padding: '4px 8px', background: '#10B981', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>+ Add</button>
            </div>
            {processors.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: 20 }}>No processors added</div>
            ) : (
              <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                {processors.map((proc, idx) => renderComponentEditor(proc, 'processor', idx))}
              </div>
            )}
          </div>

          <div style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: 16, background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#F59E0B' }}>Exporters ({exporters.length})</h4>
              <button onClick={() => addComponent('exporter')} style={{ padding: '4px 8px', background: '#F59E0B', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>+ Add</button>
            </div>
                {exporters.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: 20 }}>No exporters added</div>
                ) : (
                  <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                    {exporters.map((exp, idx) => {
                      const compKey = `exporter-${idx}`;
                      const isExtension = exp._isExtension === true;
                      // For extensions, render with special styling
                      if (isExtension) {
                        const isExpanded = expandedComponents.has(compKey);
                        return (
                          <div key={idx} style={{ marginBottom: 12, border: '1px solid #F59E0B', borderRadius: 6, overflow: 'hidden', borderLeft: '4px solid #F59E0B', background: '#FFFBEB' }}>
                            <div style={{ 
                              padding: 12, 
                              background: isExpanded ? '#FEF3C7' : '#FFFBEB',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              cursor: 'pointer'
                            }} onClick={() => toggleExpand(compKey)}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 2 }}>
                                  {exp.name || `exporter_${idx + 1}`}
                                  <span style={{ fontSize: 10, marginLeft: 8, color: '#78350F', fontWeight: 400 }}>
                                    (Extension: {exp._sectionName})
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: '#92400E' }}>Custom Section</div>
                              </div>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeComponent('exporter', idx);
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    background: '#EF4444',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    fontSize: 11,
                                    fontWeight: 500
                                  }}
                                >
                                  Delete
                                </button>
                                <span style={{ fontSize: 14, color: '#92400E' }}>{isExpanded ? '▼' : '▶'}</span>
                              </div>
                            </div>
                            {isExpanded && renderComponentEditor(exp, 'exporter', idx)}
                          </div>
                        );
                      }
                      // Regular exporters use standard renderComponentEditor
                      return renderComponentEditor(exp, 'exporter', idx);
                    })}
                  </div>
                )}
          </div>
        </div>
        )}

        {/* Raw YAML Editor Mode */}
        {useRawYAML && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                ⚡ Raw YAML Configuration Editor
              </label>
              <button
                onClick={() => {
                  if (generatedConfig) {
                    setRawYAMLConfig(generatedConfig);
                  }
                }}
                style={{ padding: '6px 12px', background: '#6B7280', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
              >
                Load from Generated
              </button>
            </div>
            <textarea
              value={rawYAMLConfig}
              onChange={(e) => setRawYAMLConfig(e.target.value)}
              placeholder={`# OpenTelemetry Collector Configuration (YAML)
# Example:
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024

exporters:
  logging:
    loglevel: info

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [logging]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [logging]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [logging]
`}
              style={{
                width: '100%',
                minHeight: 500,
                fontFamily: 'monospace',
                fontSize: 12,
                padding: 16,
                border: '2px solid #10B981',
                borderRadius: 6,
                background: '#F9FAFB',
                resize: 'vertical',
                lineHeight: '1.6'
              }}
            />
            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                disabled={!canEditConfig}
                onClick={() => {
                  if (!selectedAgentUID) {
                    alert('Please select an agent first');
                    return;
                  }
                  if (!rawYAMLConfig.trim()) {
                    alert('Please enter a YAML configuration');
                    return;
                  }
                  // Directly save the raw YAML
                  const saveRawConfig = async () => {
                    if (!selectedAgentUID || selectedAgentUID.trim() === '') {
                      alert('❌ Error: No agent selected. Please select an agent from the dropdown above.');
                      return;
                    }
                    
                    const configToSave = rawYAMLConfig.trim();
                    if (!configToSave || configToSave === '') {
                      alert('❌ Error: Configuration is empty. Please enter a YAML configuration.');
                      return;
                    }
                    
                    // Show loading indicator
                    const saveButton = document.activeElement as HTMLElement;
                    const originalText = saveButton?.textContent;
                    if (saveButton) {
                      saveButton.textContent = '⏳ Saving...';
                      (saveButton as HTMLButtonElement).disabled = true;
                    }
                    
                    try {
                      console.log('Saving raw config for agent:', selectedAgentUID);
                      const response: any = await backendSrv.post('/api/plugins/otel-collector-agent-fleet-management/resources/configs', {
                        agentUid: selectedAgentUID,
                        name: `Raw Config - ${new Date().toLocaleString()}`,
                        config: configToSave
                      });
                      
                      if (response.validationErrors && response.validationErrors.length > 0) {
                        alert('❌ Configuration validation failed:\n\n' + response.validationErrors.join('\n') + '\n\nPlease fix the errors and try again.');
                      } else if (response.ok === false) {
                        alert('❌ Failed to save configuration:\n' + (response.message || 'Unknown error'));
                      } else {
                        setGeneratedConfig(configToSave);
                        if (selectedAgentUID) {
                          await loadConfigVersions(selectedAgentUID);
                        }
                        alert('✅ Raw YAML configuration saved successfully!\n\n⚠️ Note: It will require admin approval before it can be pushed to the agent.');
                      }
                    } catch (err: any) {
                      console.error('Failed to save raw config:', err);
                      const errorMsg = err.data?.message || err.message || 'Unknown error';
                      const validationErrors = err.data?.validationErrors;
                      
                      if (validationErrors && validationErrors.length > 0) {
                        alert('❌ Configuration validation failed:\n\n' + validationErrors.join('\n') + '\n\nPlease fix the errors and try again.');
                      } else {
                        alert('❌ Failed to save raw config:\n\n' + errorMsg + '\n\nPlease check the console for details.');
                      }
                    } finally {
                      if (saveButton) {
                        if (originalText) saveButton.textContent = originalText;
                        (saveButton as HTMLButtonElement).disabled = false;
                      }
                    }
                  };
                  saveRawConfig();
                }}
                style={{ padding: '8px 20px', background: '#10B981', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
              >
                💾 Save Raw YAML Config
              </button>
              <button
                onClick={() => {
                  if (!rawYAMLConfig.trim()) {
                    alert('Please enter a YAML configuration to apply.');
                    return;
                  }
                  const trimmed = rawYAMLConfig.trim();
                  const ok = parseConfigYAML(trimmed);
                  if (ok) {
                    setGeneratedConfig(trimmed);
                    alert('✅ Applied raw YAML to the visual editor preview. Review the Generated Configuration section below.');
                  } else {
                    console.warn('Raw YAML apply failed validation.');
                  }
                }}
                style={{ padding: '8px 16px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              >
                ⚙️ Apply Raw YAML
              </button>
              <button
                onClick={() => setRawYAMLConfig('')}
                style={{ padding: '6px 16px', background: '#6B7280', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              >
                Clear
              </button>
            </div>
            <div style={{ marginTop: 12, padding: 12, background: '#DBEAFE', borderRadius: 6, border: '1px solid #93C5FD' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#1E40AF' }}>
                💡 Raw YAML Mode Tips
              </div>
              <div style={{ fontSize: 11, color: '#1E3A8A' }}>
                • Write your OpenTelemetry Collector YAML configuration directly<br/>
                • The configuration will be validated before saving<br/>
                • After saving, it will require admin approval before pushing to agents<br/>
                • You can switch back to form-based mode at any time
              </div>
            </div>
          </div>
        )}

        {!useRawYAML && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <label style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>Generated Configuration</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={generateConfig}
                  style={{
                    padding: '8px 16px',
                    background: (() => {
                      const configuredReceivers = receivers.filter((r: any) => typeof r.name === 'string' && r.name.trim() !== '');
                      return configuredReceivers.length === 0 ? '#FBBF24' : '#3B82F6';
                    })(),
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: (() => {
                      const configuredReceivers = receivers.filter((r: any) => typeof r.name === 'string' && r.name.trim() !== '');
                      return configuredReceivers.length === 0 ? 'pointer' : 'pointer';
                    })(),
                    fontSize: 14,
                    fontWeight: 500
                  }}
                  title={(() => {
                    const configuredReceivers = receivers.filter((r: any) => typeof r.name === 'string' && r.name.trim() !== '');
                    if (configuredReceivers.length === 0) {
                      return 'No receivers configured; generated YAML will be incomplete. Click only if you plan to edit the result manually.';
                    }
                    return exporters.length === 0 ? 'Warning: No exporters configured. Config will be incomplete.' : '';
                  })()}
                >
                  Generate Config
                </button>
                {generatedConfig && (
                  <button onClick={() => setGeneratedConfig('')} style={{ padding: '4px 12px', background: '#6B7280', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Clear</button>
                )}
              </div>
            </div>
            {generatedConfig && (
              <>
                <textarea
                  readOnly
                  value={generatedConfig}
                  style={{
                    width: '100%',
                    minHeight: 300,
                    fontFamily: 'monospace',
                    fontSize: 12,
                    padding: 12,
                    border: '1px solid #E5E7EB',
                    borderRadius: 6,
                    background: '#F9FAFB'
                  }}
                />
                {/* Save Template and Save buttons below Generated Configuration */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowSaveDialog(true)}
                    disabled={!canEditConfig || !generatedConfig || generatedConfig.trim() === ''}
                    style={{
                      padding: '8px 16px',
                      background: (!generatedConfig || generatedConfig.trim() === '') ? '#D1D5DB' : '#6B7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      cursor: (!generatedConfig || generatedConfig.trim() === '') ? 'not-allowed' : 'pointer',
                      fontSize: 14,
                      fontWeight: 500,
                      opacity: (!generatedConfig || generatedConfig.trim() === '') ? 0.5 : 1
                    }}
                    title={(!generatedConfig || generatedConfig.trim() === '') ? 'Generate config first to enable saving as template' : 'Save current configuration as a reusable template'}
                  >
                    💾 Save Template
                  </button>
                  <button
                    onClick={async () => {
                      if (!selectedAgentUID || selectedAgentUID.trim() === '') {
                        alert('❌ Error: No agent selected. Please select an agent from the dropdown above.');
                        return;
                      }
                      const configToSave = generatedConfig.trim();
                      if (!configToSave || configToSave === '') {
                        alert('❌ Error: No configuration generated. Please generate a configuration first.');
                        return;
                      }
                      
                      try {
                        const response = await backendSrv.post('/api/plugins/otel-collector-agent-fleet-management/resources/configs', {
                          agentUid: selectedAgentUID,
                          name: `Config ${new Date().toLocaleString()}`,
                          config: configToSave
                        });
                        
                        // Check for validation errors
                        if (response.validationErrors && response.validationErrors.length > 0) {
                          alert('Configuration validation failed:\n' + response.validationErrors.join('\n'));
                          return;
                        }
                        
                        if (!response.ok) {
                          alert(response.message || 'Failed to save configuration');
                          return;
                        }
                        
                        if (selectedAgentUID) {
                          await loadConfigVersions(selectedAgentUID);
                        }
                        alert('Configuration saved successfully! It will require admin approval before it can be pushed.');
                      } catch (err: any) {
                        const errorMsg = err.data?.message || err.message || 'Unknown error';
                        const validationErrors = err.data?.validationErrors;
                        if (validationErrors && validationErrors.length > 0) {
                          alert('Configuration validation failed:\n' + validationErrors.join('\n'));
                        } else {
                          alert('Failed to save config: ' + errorMsg);
                        }
                      }
                    }}
                    disabled={!canEditConfig || !generatedConfig || generatedConfig.trim() === '' || !selectedAgentUID}
                    style={{
                    padding: '8px 16px',
                    background: (!generatedConfig || generatedConfig.trim() === '' || !selectedAgentUID) ? '#D1D5DB' : '#10B981',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: (!generatedConfig || generatedConfig.trim() === '' || !selectedAgentUID) ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                    fontWeight: 500,
                    opacity: (!generatedConfig || generatedConfig.trim() === '' || !selectedAgentUID) ? 0.5 : 1
                  }}
                  title={!selectedAgentUID ? 'Select an agent first' : (!generatedConfig || generatedConfig.trim() === '') ? 'Generate config first to enable saving' : 'Save configuration to selected agent'}
                >
                  💾 Save
                </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Pending Approvals Section - Always show at top if there are pending configs */}
        {selectedAgentUID && configVersions.length > 0 && (
          (() => {
            // Ensure we only show pending configs for THIS specific agent
            const pendingConfigs = configVersions.filter((v: any) => v.agentUid === selectedAgentUID && v.approvalStatus === 'pending');
            if (pendingConfigs.length === 0) return null;
            
            return (
              <div style={{ marginTop: 24, marginBottom: 24 }}>
                <div style={{
                  padding: 16,
                  background: '#FEF3C7',
                  borderRadius: 6,
                  border: '2px solid #FCD34D'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#92400E', marginBottom: 4 }}>
                        ⚠️ Pending Approvals ({pendingConfigs.length})
                      </div>
                      <div style={{ fontSize: 12, color: '#78350F' }}>
                        {isAdmin 
                          ? 'Review and approve these configurations below to enable pushing them to agents.'
                          : `These configurations are waiting for admin approval. Only admins can approve configurations.`}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#78350F', marginTop: 8 }}>
                    {pendingConfigs.map((cfg: any, idx: number) => (
                      <div key={cfg.id} style={{ marginBottom: 8, padding: 8, background: 'white', borderRadius: 4 }}>
                        <strong>Version {cfg.version}</strong> - Created by {cfg.createdBy || 'unknown'} at {cfg.createdAt ? new Date(cfg.createdAt).toLocaleString() : 'N/A'}
                        {!isAdmin && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: '#B45309' }}>⏳ Awaiting admin approval</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {!isAdmin && (
                    <div style={{ fontSize: 12, color: '#78350F', marginTop: 8, padding: 8, background: 'white', borderRadius: 4 }}>
                      💡 <strong>Next Steps:</strong> Contact an administrator to approve the configuration. Once approved, you'll be able to push it to the agent.
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        )}
        {/* Version History Section */}
        {selectedAgentUID && configVersions.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: 16, color: '#111827' }}>📋 Configuration History & Approval Queue</label>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                  {(() => {
                    // Double-check: filter configs by selected agent to ensure we only show this agent's configs
                    const agentConfigs = configVersions.filter((v: any) => v.agentUid === selectedAgentUID);
                    const pending = agentConfigs.filter((v: any) => v.approvalStatus === 'pending').length;
                    const approved = agentConfigs.filter((v: any) => v.approvalStatus === 'approved').length;
                    const rejected = agentConfigs.filter((v: any) => v.approvalStatus === 'rejected').length;
                    return `Agent: ${selectedAgentUID.substring(0, 16)}... • ${pending} pending • ${approved} approved • ${rejected} rejected • Last 5 versions shown`;
                  })()}
                </div>
              </div>
              {isAdmin && (
                <div style={{
                  padding: '6px 12px',
                  background: '#D1FAE5',
                  borderRadius: 6,
                  border: '1px solid #86EFAC'
                }}>
                  <span style={{ fontSize: 12, color: '#065F46', fontWeight: 600 }}>👤 Admin Mode - Can Approve/Reject</span>
                </div>
              )}
              {!isAdmin && (
                <div style={{
                  padding: '6px 12px',
                  background: '#FEF3C7',
                  borderRadius: 6,
                  border: '1px solid #FCD34D',
                  fontSize: 11,
                  color: '#92400E'
                }}>
                  Admin approval is required for configuration changes to reach an agent.
                </div>
              )}
            </div>
            <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 6, overflow: 'hidden' }}>
              {configVersions.filter((v: any) => v.agentUid === selectedAgentUID).map((version: any, idx: number) => {
                // Check if config has failed (even if approved)
                const syncStatus = configSyncStatus[version.id];
                const hasFailed = syncStatus && version.pushedAt && (
                  (syncStatus.remoteConfigStatus || '').includes('FAILED') || 
                  !!syncStatus.remoteConfigError
                );
                
                const statusColor = hasFailed ? '#EF4444' : 
                                   version.approvalStatus === 'approved' ? '#10B981' : 
                                   version.approvalStatus === 'rejected' ? '#EF4444' : '#F59E0B';
                const isApproved = version.approvalStatus === 'approved';
                const displayStatus = hasFailed ? 'FAILED' : (version.approvalStatus || 'pending');
                return (
                  <div key={version.id} style={{
                    padding: 16,
                    borderBottom: idx < configVersions.length - 1 ? '1px solid #E5E7EB' : 'none',
                    background: idx === 0 ? '#F9FAFB' : 'white'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>Version {version.version}</span>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 500,
                            background: statusColor,
                            color: 'white'
                          }}>{displayStatus}</span>
                          {hasFailed && (
                            <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>
                              ⚠️ Config Error
                            </span>
                          )}
                          {version.pushedAt && (
                            <span style={{ fontSize: 11, color: '#3B82F6', fontWeight: 500 }}>
                              ✓ Pushed at {new Date(version.pushedAt).toLocaleString()}
                              {version.pushedBy && ` by ${version.pushedBy}`}
                            </span>
                          )}
                          {isApproved && !version.pushedAt && (
                            <span style={{ fontSize: 11, color: '#10B981', fontWeight: 500 }}>✓ Ready to Push</span>
                          )}
                        </div>
                        <div style={{ 
                          fontSize: 12, 
                          color: '#6B7280',
                          padding: 8,
                          background: '#F3F4F6',
                          borderRadius: 4,
                          marginBottom: 8
                        }}>
                          <div style={{ marginBottom: 4 }}>
                            <strong>Created:</strong> {version.createdBy || 'unknown'} at {version.createdAt ? new Date(version.createdAt).toLocaleString() : 'N/A'}
                          </div>
                          {version.modifiedAt && version.modifiedAt !== version.createdAt && (
                            <div style={{ marginBottom: 4 }}>
                              <strong>Modified:</strong> {version.modifiedBy} at {new Date(version.modifiedAt).toLocaleString()}
                            </div>
                          )}
                          {version.approvedBy && (
                            <div style={{ marginBottom: 4, color: version.approvalStatus === 'approved' ? '#10B981' : '#EF4444' }}>
                              <strong>{version.approvalStatus === 'approved' ? '✓ Approved' : '✗ Rejected'}:</strong> {version.approvedBy} at {version.approvedAt ? new Date(version.approvedAt).toLocaleString() : ''}
                              {version.approvalComment && (
                                <div style={{ marginTop: 6, fontSize: 11, fontStyle: 'italic', color: '#6B7280', padding: '6px 10px', background: '#F9FAFB', borderRadius: 4, borderLeft: '3px solid #D1D5DB' }}>
                                  💬 <strong>Comment:</strong> {version.approvalComment}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Show failure status prominently if config failed */}
                          {(() => {
                            const syncStatus = configSyncStatus[version.id];
                            if (syncStatus && version.pushedAt) {
                              const remoteStatus = syncStatus.remoteConfigStatus || '';
                              const hashMatch = syncStatus.hashMatch;
                              const hasError = syncStatus.remoteConfigError;
                              if (remoteStatus.includes('FAILED') || hasError) {
                                const errorMsg = syncStatus.remoteConfigError || 'Configuration failed to apply';
                                return (
                                  <div style={{ 
                                    marginTop: 8,
                                    padding: '10px 12px',
                                    background: '#FEE2E2',
                                    borderRadius: 4,
                                    border: '2px solid #EF4444',
                                    fontSize: 11
                                  }}>
                                    <div style={{ fontWeight: 600, color: '#991B1B', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      ❌ <span>Configuration Failed to Apply</span>
                                    </div>
                                    <div style={{ 
                                      color: '#7F1D1D',
                                      fontFamily: 'monospace',
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-word',
                                      fontSize: 10,
                                      lineHeight: '1.5',
                                      maxHeight: '150px',
                                      overflowY: 'auto',
                                      padding: '6px 8px',
                                      background: '#FFFFFF',
                                      borderRadius: 3
                                    }}>
                                      {errorMsg}
                                    </div>
                                  </div>
                                );
                              }
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button
                          onClick={() => {
                            const configId = version.id || version['id'];
                            if (!configId) {
                              alert('Invalid config ID');
                              console.error('Config ID missing in version:', version);
                              return;
                            }
                            loadConfigDiff(String(configId));
                          }}
                          style={{ padding: '6px 14px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
                        >
                          📊 View Diff
                        </button>
                        {(() => {
                          // Fix 2: Revert button validation
                          const agentConfigs = configVersions.filter((v: any) => v.agentUid === selectedAgentUID);
                          const latestVersion = agentConfigs.length > 0 ? Math.max(...agentConfigs.map((v: any) => v.version || 0)) : 0;
                          const isLatestVersion = version.version === latestVersion;
                          const isNotApproved = version.approvalStatus !== 'approved';
                          
                          // Find agent status
                          const agent = agents.find((a: Agent) => a.agentUid === selectedAgentUID);
                          const agentNotOnline = !agent || agent.status !== 'online';
                          
                          const canRevert = canEditConfig && !isLatestVersion && isApproved && !agentNotOnline;
                          const disabledReason = isLatestVersion ? 'Cannot revert to the latest version' :
                                                isNotApproved ? 'Only approved configurations can be reverted' :
                                                agentNotOnline ? 'Agent must be online to revert' :
                                                '';
                          
                          return (
                            <button
                              onClick={() => {
                                if (!canRevert) {
                                  alert(`Cannot revert: ${disabledReason}`);
                                  return;
                                }
                                const configId = version.id || version['id'];
                                if (!configId) {
                                  alert('Invalid config ID');
                                  console.error('Config ID missing in version:', version);
                                  return;
                                }
                                revertConfig(Number(configId));
                              }}
                              disabled={!canRevert}
                              title={disabledReason || 'Revert to this configuration version'}
                              style={{ 
                                padding: '6px 14px', 
                                background: canRevert ? '#6B7280' : '#D1D5DB', 
                                color: canRevert ? 'white' : '#9CA3AF', 
                                border: 'none', 
                                borderRadius: 4, 
                                cursor: canRevert ? 'pointer' : 'not-allowed', 
                                fontSize: 12, 
                                fontWeight: 500,
                                opacity: canRevert ? 1 : 0.6
                              }}
                            >
                              ↩️ Revert
                            </button>
                          );
                        })()}
                        {isApproved && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {!version.pushedAt ? (
                              <button
                                disabled={!canEditConfig}
                                onClick={async () => {
                                  try {
                                    const resp = await backendSrv.get(`/api/plugins/otel-collector-agent-fleet-management/resources/configs/${version.id}`);
                                    await onPushConfig(selectedAgentUID, resp.config);
                                    alert('✅ Configuration pushed. Watch the collector health badge for status updates.');
                                    if (selectedAgentUID) {
                                      await loadConfigVersions(selectedAgentUID);
                                    }
                                  } catch (err: any) {
                                    alert('Failed to push config: ' + (err.message || 'Unknown error'));
                                  }
                                }}
                                style={{ 
                                  padding: '6px 14px', 
                                  background: '#10B981', 
                                  color: 'white', 
                                  border: 'none', 
                                  borderRadius: 4, 
                                  cursor: 'pointer', 
                                  fontSize: 12, 
                                  fontWeight: 500 
                                }}
                              >
                                🚀 Push This Version
                              </button>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ 
                                  padding: '8px 12px', 
                                  background: '#E0E7FF', 
                                  borderRadius: 4, 
                                  border: '1px solid #C7D2FE',
                                  fontSize: 11,
                                  color: '#3730A3'
                                }}>
                                  ✓ Pushed at {new Date(version.pushedAt).toLocaleString()}
                                  {version.pushedBy && ` by ${version.pushedBy}`}
                                </div>
                            {(() => {
                              const syncStatus = configSyncStatus[version.id];
                              if (!syncStatus) {
                                return (
                                  <span style={{ 
                                    padding: '4px 10px', 
                                    background: '#6B7280', 
                                    color: 'white', 
                                    borderRadius: 4, 
                                    fontSize: 11, 
                                    fontWeight: 500,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6
                                  }}>
                                    ⏳ Checking sync status...
                                  </span>
                                );
                              }
                                  
                                  const remoteStatus = syncStatus.remoteConfigStatus || '';
                                  const hashMatch = syncStatus.hashMatch;
                                  const hasError = syncStatus.remoteConfigError;
                                  
                                  if (remoteStatus.includes('APPLIED') && hashMatch) {
                                    return (
                                      <span style={{ 
                                        padding: '4px 10px', 
                                        background: '#10B981', 
                                        color: 'white', 
                                        borderRadius: 4, 
                                        fontSize: 11, 
                                        fontWeight: 500,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6
                                      }}>
                                        ✅ Synced
                                      </span>
                                    );
                                  } else if (remoteStatus.includes('FAILED') || hasError) {
                                    const errorMsg = syncStatus.remoteConfigError || 'Unknown error';
                                    return (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <span style={{ 
                                          padding: '6px 12px', 
                                          background: '#EF4444', 
                                          color: 'white', 
                                          borderRadius: 4, 
                                          fontSize: 12, 
                                          fontWeight: 600,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 6
                                        }}>
                                          ❌ Configuration Failed
                                        </span>
                                        {errorMsg && (
                                          <div style={{
                                            padding: '10px 12px',
                                            background: '#FEE2E2',
                                            borderRadius: 4,
                                            border: '1px solid #FCA5A5',
                                            fontSize: 11,
                                            color: '#991B1B',
                                            fontFamily: 'monospace',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                            maxWidth: '400px',
                                            maxHeight: '200px',
                                            overflowY: 'auto'
                                          }}>
                                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Error Details:</div>
                                            {errorMsg}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  } else if (remoteStatus.includes('APPLYING')) {
                                    return (
                                      <span style={{ 
                                        padding: '4px 10px', 
                                        background: '#F59E0B', 
                                        color: 'white', 
                                        borderRadius: 4, 
                                        fontSize: 11, 
                                        fontWeight: 500,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6
                                      }}>
                                        ⏳ Syncing...
                                      </span>
                                    );
                                  } else {
                                    return (
                                      <div style={{ 
                                        padding: '6px 10px', 
                                        background: '#F3F4F6', 
                                        color: '#374151', 
                                        borderRadius: 4, 
                                        fontSize: 11,
                                        lineHeight: 1.5
                                      }}>
                                        Agent has not reported a RemoteConfigStatus yet. After pushing, track the collector health badge in the roster (green = applied, red = offline).
                                      </div>
                                    );
                                  }
                                })()}
                                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 6 }}>
                                  After pushing, watch the collector health indicator under the Collectors tab. Green means the agent is healthy, red means it needs attention.
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {version.approvalStatus === 'pending' && (
                          <div style={{
                            padding: 12,
                            background: '#FEF3C7',
                            borderRadius: 6,
                            border: '2px solid #FCD34D',
                            marginTop: 8
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#92400E', marginBottom: 8 }}>
                              ⚠️ AWAITING APPROVAL {isAdmin ? '(You are admin)' : '(Admin required)'}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                onClick={() => handleApprovalClick(String(version.id), 'approve')}
                                disabled={!isAdmin || version.approvalStatus === 'approved' || version.approvalStatus === 'rejected'}
                                style={{ 
                                  flex: 1,
                                  padding: '8px 16px', 
                                  background: (version.approvalStatus === 'approved' || version.approvalStatus === 'rejected') ? '#D1D5DB' : '#10B981', 
                                  color: 'white', 
                                  border: 'none', 
                                  borderRadius: 6, 
                                  cursor: (version.approvalStatus === 'approved' || version.approvalStatus === 'rejected') ? 'not-allowed' : 'pointer', 
                                  fontSize: 13, 
                                  fontWeight: 600,
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                  opacity: (version.approvalStatus === 'approved' || version.approvalStatus === 'rejected') ? 0.5 : 1
                                }}
                                title={isAdmin ? 'Approve this configuration as admin' : 'Grafana Admin role required'}
                              >
                                ✓ Approve Configuration
                              </button>
                              <button
                                onClick={() => handleApprovalClick(String(version.id), 'reject')}
                                disabled={!isAdmin || version.approvalStatus === 'approved' || version.approvalStatus === 'rejected'}
                                style={{ 
                                  flex: 1,
                                  padding: '8px 16px', 
                                  background: (version.approvalStatus === 'approved' || version.approvalStatus === 'rejected') ? '#D1D5DB' : '#EF4444', 
                                  color: 'white', 
                                  border: 'none', 
                                  borderRadius: 6, 
                                  cursor: (version.approvalStatus === 'approved' || version.approvalStatus === 'rejected') ? 'not-allowed' : 'pointer', 
                                  fontSize: 13, 
                                  fontWeight: 600,
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                  opacity: (version.approvalStatus === 'approved' || version.approvalStatus === 'rejected') ? 0.5 : 1
                                }}
                                title={isAdmin ? 'Reject this configuration as admin' : 'Grafana Admin role required'}
                              >
                                ✗ Reject Configuration
                              </button>
                            </div>
                            <div style={{ fontSize: 11, color: '#78350F', marginTop: 8 }}>
                              💡 Review the configuration above, then approve or reject it. Approved configs can be pushed to agents.
                              {!isAdmin && <div style={{ marginTop: 4, fontSize: 10 }}>Contact a Grafana Admin to approve or reject this configuration.</div>}
                            </div>
                          </div>
                        )}
                        {version.approvalStatus === 'rejected' && (
                          <div style={{
                            padding: 12,
                            background: '#FEE2E2',
                            borderRadius: 6,
                            border: '2px solid #FECACA',
                            marginTop: 8
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#991B1B', marginBottom: 4 }}>
                              ✗ Configuration Rejected
                            </div>
                            <div style={{ fontSize: 11, color: '#7F1D1D' }}>
                              This configuration has been rejected and cannot be approved again. Create a new version if you need to make changes.
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Approval/Reject Dialog */}
        {showApprovalDialog && approvalAction && approvalConfigId && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }} onClick={() => {
            setShowApprovalDialog(false);
            setApprovalAction(null);
            setApprovalConfigId(null);
            setApprovalComment('');
          }}>
            <div style={{
              background: 'white',
              borderRadius: 8,
              padding: 24,
              maxWidth: 500,
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
            }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600, color: approvalAction === 'approve' ? '#10B981' : '#EF4444' }}>
                {approvalAction === 'approve' ? '✓ Approve Configuration' : '✗ Reject Configuration'}
              </h3>
              <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#6B7280' }}>
                {approvalAction === 'approve' 
                  ? 'Are you sure you want to approve this configuration? Approved configurations can be pushed to agents.'
                  : 'Please provide a reason for rejecting this configuration. Comments are required for rejections.'}
              </p>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#111827' }}>
                  {approvalAction === 'reject' ? 'Rejection Reason *' : 'Comment (Optional)'}
                </label>
                <textarea
                  value={approvalComment}
                  onChange={(e) => setApprovalComment(e.target.value)}
                  placeholder={approvalAction === 'reject' 
                    ? 'Please explain why this configuration is being rejected...' 
                    : 'Add any notes about this approval (optional)...'}
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: 6,
                    fontSize: 13,
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowApprovalDialog(false);
                    setApprovalAction(null);
                    setApprovalConfigId(null);
                    setApprovalComment('');
                  }}
                  style={{
                    padding: '8px 16px',
                    background: '#F3F4F6',
                    color: '#111827',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={approveConfig}
                  disabled={approvalAction === 'reject' && !approvalComment.trim()}
                  style={{
                    padding: '8px 16px',
                    background: approvalAction === 'approve' ? '#10B981' : '#EF4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: (approvalAction === 'reject' && !approvalComment.trim()) ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    opacity: (approvalAction === 'reject' && !approvalComment.trim()) ? 0.5 : 1
                  }}
                >
                  {approvalAction === 'approve' ? '✓ Confirm Approval' : '✗ Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Diff Modal */}
        {showDiff && diffData && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }} onClick={() => setShowDiff(false)}>
            <div style={{
              background: 'white',
              borderRadius: 8,
              padding: 24,
              maxWidth: '90%',
              maxHeight: '90%',
              width: 1000,
              overflow: 'auto',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Configuration Diff</h3>
                <button onClick={() => setShowDiff(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#4B5563' }}>
                  Viewing scope:&nbsp;
                  <strong>{diffData.currentScope ? diffData.currentScope : 'full document'}</strong>
                  {diffData.previousScope && diffData.previousScope !== diffData.currentScope && (
                    <> (previous: {diffData.previousScope})</>
                  )}
                </div>
                {diffData.fullCurrent && (
                  <button
                    onClick={() => setShowFullDiff((prev) => !prev)}
                    style={{
                      padding: '6px 12px',
                      background: showFullDiff ? '#1F2937' : '#2563EB',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 500
                    }}
                  >
                    {showFullDiff ? 'Hide Full CR YAML' : 'Show Full CR YAML'}
                  </button>
                )}
              </div>
              {showFullDiff && diffData.fullCurrent && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Full Current CRD YAML</div>
                  <pre style={{
                    maxHeight: 200,
                    overflow: 'auto',
                    background: '#F3F4F6',
                    padding: 12,
                    borderRadius: 4,
                    fontSize: 11
                  }}>
{diffData.fullCurrent}
                  </pre>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#DC2626' }}>
                    ❌ {diffData.isUsingBaseline ? 'Baseline' : `Previous Version (v${diffData.previousVersion || 'N/A'})`} (Removed/Changed)
                  </div>
                  <div style={{
                    width: '100%',
                    minHeight: 400,
                    maxHeight: 500,
                    fontFamily: 'monospace',
                    fontSize: 11,
                    padding: 8,
                    border: '2px solid #FCA5A5',
                    borderRadius: 4,
                    background: '#FEE2E2',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word'
                  }}>
                    {diffData.diff && diffData.diff.length > 0 ? (
                      diffData.diff.map((change: any, idx: number) => {
                        if (change.type === 'removed' || change.type === 'modified') {
                          return (
                            <div key={idx} style={{
                              padding: '2px 4px',
                              background: '#FECACA',
                              borderLeft: '3px solid #DC2626',
                              marginBottom: 1
                            }}>
                              <span style={{ color: '#991B1B', marginRight: 8, userSelect: 'none', fontWeight: 600 }}>L{change.line}</span>
                              <span style={{ color: '#7F1D1D' }}>{change.old || ' '}</span>
                            </div>
                          );
                        }
                        return null;
                      })
                    ) : (
                      <div style={{ color: '#6B7280', fontStyle: 'italic' }}>No changes detected</div>
                    )}
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#059669' }}>
                    ✅ Selected Version (v{diffData.currentVersion || 'N/A'}) (New/Changed)
                  </div>
                  <div style={{
                    width: '100%',
                    minHeight: 400,
                    maxHeight: 500,
                    fontFamily: 'monospace',
                    fontSize: 11,
                    padding: 8,
                    border: '2px solid #86EFAC',
                    borderRadius: 4,
                    background: '#D1FAE5',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word'
                  }}>
                    {diffData.diff && diffData.diff.length > 0 ? (
                      diffData.diff.map((change: any, idx: number) => {
                        if (change.type === 'added' || change.type === 'modified') {
                          return (
                            <div key={idx} style={{
                              padding: '2px 4px',
                              background: change.type === 'modified' ? '#A7F3D0' : '#D1FAE5',
                              borderLeft: change.type === 'modified' ? '3px solid #059669' : '3px solid #10B981',
                              marginBottom: 1
                            }}>
                              <span style={{ color: '#065F46', marginRight: 8, userSelect: 'none', fontWeight: 600 }}>L{change.line}</span>
                              <span style={{ color: '#047857' }}>{change.new || ' '}</span>
                            </div>
                          );
                        }
                        return null;
                      })
                    ) : (
                      <div style={{ color: '#6B7280', fontStyle: 'italic' }}>No changes detected</div>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 16 }}>Changes Summary</div>
                <div style={{ 
                  marginBottom: 16, 
                  padding: 12, 
                  background: diffData.diff && diffData.diff.filter((d: any) => d.type === 'modified').length > 0 ? '#FEF3C7' : '#F3F4F6',
                  borderRadius: 6,
                  border: `2px solid ${diffData.diff && diffData.diff.filter((d: any) => d.type === 'modified').length > 0 ? '#F59E0B' : '#D1D5DB'}`
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                    📊 Change Statistics
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>
                    • <strong>{diffData.diff ? diffData.diff.filter((d: any) => d.type === 'modified').length : 0}</strong> lines modified/changed
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>
                    • <strong>{diffData.diff ? diffData.diff.filter((d: any) => d.type === 'unchanged').length : 0}</strong> lines unchanged
                  </div>
                  {(diffData.current || '').split('\n').length !== (diffData.previous || '').split('\n').length && (
                    <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 4 }}>
                      ⚠️ Line count changed: Previous ({((diffData.previous || '').split('\n').length)}) → Current ({((diffData.current || '').split('\n').length)})
                    </div>
                  )}
                </div>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 16 }}>Line-by-Line Changes</div>
                <div style={{ 
                  maxHeight: 300, 
                  overflow: 'auto',
                  background: '#F9FAFB',
                  padding: 12,
                  borderRadius: 6,
                  border: '1px solid #E5E7EB'
                }}>
                  {diffData.diff && diffData.diff.length > 0 ? (
                    diffData.diff
                      .filter((change: any) => change.type !== 'unchanged')  // Only show changed lines!
                      .map((change: any, idx: number) => (
                      <div key={idx} style={{
                        padding: 10,
                        marginBottom: 6,
                        background: change.type === 'modified' ? '#FFF3CD' : change.type === 'added' ? '#D1FAE5' : '#FEE2E2',
                        borderRadius: 4,
                        fontSize: 12,
                        borderLeft: change.type === 'modified' ? '3px solid #F59E0B' : change.type === 'added' ? '3px solid #10B981' : '3px solid #EF4444'
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: 4, color: '#111827' }}>
                          Line {change.line}: {change.type === 'modified' ? '✏️ Modified' : change.type === 'added' ? '➕ Added' : '➖ Removed'}
                        </div>
                        {change.type === 'modified' || change.type === 'removed' ? (
                          <div>
                            <div style={{ color: '#7F1D1D', marginBottom: 4, padding: 4, background: '#FEE2E2', borderRadius: 2, fontWeight: 600 }}>
                              <strong>- </strong> {change.old || '(empty)'}
                            </div>
                            {change.type === 'modified' && (
                              <div style={{ color: '#065F46', padding: 4, background: '#D1FAE5', borderRadius: 2, fontWeight: 600 }}>
                                <strong>+ </strong> {change.new || '(empty)'}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ color: '#065F46', padding: 4, background: '#D1FAE5', borderRadius: 2, fontWeight: 600 }}>
                            <strong>+ </strong> {change.new || '(empty)'}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>
                      No changes detected (configurations are identical)
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Component Type Manager Modal */}
      {showComponentTypeManager && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => {
          setShowComponentTypeManager(false);
          setEditingComponentType(null);
        }}>
          <div style={{
            background: 'white',
            borderRadius: 8,
            padding: 24,
            maxWidth: 900,
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Manage Component Types</h3>
              <button
                onClick={() => {
                  setShowComponentTypeManager(false);
                  setEditingComponentType(null);
                }}
                style={{
                  background: '#EF4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: 14
                }}
              >
                Close
              </button>
            </div>

            {/* Category Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid #E5E7EB' }}>
              {(['receiver', 'processor', 'exporter'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => {
                    if (!editingComponentType || editingComponentType.category !== cat) {
                      setEditingComponentType({ category: cat, type: '', label: '', config: {}, description: '' });
                    }
                  }}
                  style={{
                    padding: '10px 20px',
                    background: (editingComponentType?.category || 'receiver') === cat ? '#3B82F6' : 'transparent',
                    color: (editingComponentType?.category || 'receiver') === cat ? 'white' : '#6B7280',
                    border: 'none',
                    borderBottom: (editingComponentType?.category || 'receiver') === cat ? '3px solid #2563EB' : '3px solid transparent',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    textTransform: 'capitalize'
                  }}
                >
                  {cat}s
                </button>
              ))}
            </div>

            {/* Add New Type Form */}
            {editingComponentType && (
              <div style={{ marginBottom: 24, padding: 16, background: '#F9FAFB', borderRadius: 6 }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: 16 }}>
                  {editingComponentType.id ? 'Edit' : 'Add New'} {editingComponentType.category?.charAt(0).toUpperCase()}{editingComponentType.category?.slice(1)} Type
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Type Name (e.g., "my_custom_receiver")</label>
                    <input
                      type="text"
                      value={editingComponentType.type || ''}
                      onChange={(e) => setEditingComponentType({ ...editingComponentType, type: e.target.value })}
                      placeholder="my_custom_receiver"
                      disabled={!!editingComponentType.isSystem}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 4 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Display Label</label>
                    <input
                      type="text"
                      value={editingComponentType.label || ''}
                      onChange={(e) => setEditingComponentType({ ...editingComponentType, label: e.target.value })}
                      placeholder="My Custom Receiver"
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 4 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Description</label>
                    <textarea
                      value={editingComponentType.description || ''}
                      onChange={(e) => setEditingComponentType({ ...editingComponentType, description: e.target.value })}
                      placeholder="Description of this component type..."
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 4, minHeight: 60 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Default Config (JSON)</label>
                    <textarea
                      value={JSON.stringify(editingComponentType.config || {}, null, 2)}
                      onChange={(e) => {
                        try {
                          setEditingComponentType({ ...editingComponentType, config: JSON.parse(e.target.value) });
                        } catch (err) {
                          // Invalid JSON, keep as-is for now
                        }
                      }}
                      placeholder='{"endpoint": "http://localhost:4317"}'
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 4, minHeight: 100, fontFamily: 'monospace', fontSize: 12 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={async () => {
                        try {
                          if (editingComponentType.id) {
                            await backendSrv.request({
                              url: `/api/plugins/otel-collector-agent-fleet-management/resources/component-types`,
                              method: 'PATCH',
                              data: {
                                id: editingComponentType.id,
                                label: editingComponentType.label,
                                config: editingComponentType.config,
                                description: editingComponentType.description
                              }
                            });
                          } else {
                            await backendSrv.post('/api/plugins/otel-collector-agent-fleet-management/resources/component-types', {
                              category: editingComponentType.category,
                              type: editingComponentType.type,
                              label: editingComponentType.label,
                              config: editingComponentType.config,
                              description: editingComponentType.description
                            });
                          }
                          await loadComponentTypes();
                          setEditingComponentType(null);
                          alert('Component type saved successfully!');
                        } catch (err: any) {
                          alert('Failed to save: ' + (err.message || 'Unknown error'));
                        }
                      }}
                      disabled={!editingComponentType.category || !editingComponentType.type || !editingComponentType.label}
                      style={{
                        padding: '10px 20px',
                        background: (!editingComponentType.category || !editingComponentType.type || !editingComponentType.label) ? '#D1D5DB' : '#10B981',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: (!editingComponentType.category || !editingComponentType.type || !editingComponentType.label) ? 'not-allowed' : 'pointer',
                        fontSize: 14,
                        fontWeight: 600
                      }}
                    >
                      {editingComponentType.id ? 'Update' : 'Create'} Type
                    </button>
                    <button
                      onClick={() => setEditingComponentType(null)}
                      style={{
                        padding: '10px 20px',
                        background: '#6B7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 14
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Existing Types List */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 16 }}>Existing Types</h4>
                {!editingComponentType && (
                  <button
                    onClick={() => setEditingComponentType({ category: 'receiver', type: '', label: '', config: {}, description: '' })}
                    style={{
                      padding: '6px 12px',
                      background: '#3B82F6',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 12
                    }}
                  >
                    + Add New
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                {(['receiver', 'processor', 'exporter'] as const).map(category => {
                  const types = getTypesForCategory(category);
                  return types.map((t: any) => (
                    <div key={`${category}-${t.value}`} style={{
                      padding: 12,
                      background: 'white',
                      border: '1px solid #E5E7EB',
                      borderRadius: 6
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</div>
                          <div style={{ fontSize: 11, color: '#6B7280', fontFamily: 'monospace' }}>{t.value}</div>
                          {t.description && (
                            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>{t.description}</div>
                          )}
                          {t.isSystem && (
                            <span style={{ fontSize: 10, color: '#3B82F6', fontWeight: 600 }}>System</span>
                          )}
                        </div>
                        {!t.isSystem && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              onClick={() => setEditingComponentType({ ...t, category })}
                              style={{ padding: '4px 8px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 10 }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={async () => {
                                if (confirm(`Delete ${t.label}?`)) {
                                  try {
                                    await backendSrv.request({
                                      url: `/api/plugins/otel-collector-agent-fleet-management/resources/component-types?id=${t.id}`,
                                      method: 'DELETE'
                                    });
                                    await loadComponentTypes();
                                  } catch (err: any) {
                                    alert('Failed to delete: ' + (err.message || 'Unknown error'));
                                  }
                                }
                              }}
                              style={{ padding: '4px 8px', background: '#EF4444', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 10 }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ));
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSaveDialog && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: 'white', borderRadius: 8, padding: 24, maxWidth: 500, width: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <h3 style={{ marginTop: 0 }}>Save Configuration Template</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Name *</label>
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g., Production OTLP Pipeline"
                style={{ width: '100%', padding: '8px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 14 }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Description</label>
              <textarea
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
                style={{ width: '100%', padding: '8px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 14 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowSaveDialog(false); setSaveName(''); setSaveDescription(''); }} style={{ padding: '8px 16px', background: '#6B7280', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveTemplate} style={{ padding: '8px 16px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
