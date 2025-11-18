import * as yaml from 'js-yaml';
import type { ComponentCategory } from '../types';
import { inferComponentType } from '../utils/components';

// Utility functions for ConfigGenerator

export const getComponentSignals = (component: any, componentType: 'receiver' | 'processor' | 'exporter'): string[] => {
  const signals: string[] = [];
  
  // Check component type and name for signal hints
  const type = component.type || '';
  const name = component.name || '';
  const combined = `${type} ${name}`.toLowerCase();
  
  // Receivers: Most receivers support all signals unless explicitly limited
  if (componentType === 'receiver') {
    if (type === 'prometheus' || type === 'prometheusremotewrite') {
      signals.push('metrics');
    } else if (type === 'filelog' || type === 'syslog' || type === 'journald') {
      signals.push('logs');
    } else if (type === 'jaeger' || type === 'zipkin' || type === 'otlp' || type === 'opencensus') {
      signals.push('traces');
    } else if (type === 'kafka' || type === 'otlp' || type === 'opencensus') {
      // OTLP and OpenCensus receivers can handle all signals
      signals.push('logs', 'metrics', 'traces');
    } else {
      // Default: assume all signals unless proven otherwise
      signals.push('logs', 'metrics', 'traces');
    }
  }
  
  // Processors: Most processors work with all signals
  if (componentType === 'processor') {
    if (type === 'batch' || type === 'memory_limiter' || type === 'attributes' || 
        type === 'filter' || type === 'transform' || type === 'resource' || 
        type === 'groupbyattrs' || type === 'probabilistic_sampler' || 
        type === 'tail_sampling' || type === 'span' || type === 'metricstransform') {
      signals.push('logs', 'metrics', 'traces');
    } else {
      // Default: assume all signals
      signals.push('logs', 'metrics', 'traces');
    }
  }
  
  // Exporters: Check type for signal support
  if (componentType === 'exporter') {
    if (type === 'prometheus' || type === 'prometheusremotewrite' || 
        type === 'influxdb' || type === 'carbon' || type === 'sapm') {
      signals.push('metrics');
    } else if (type === 'loki' || type === 'splunk_hec' || type === 'elasticsearch') {
      signals.push('logs');
    } else if (type === 'jaeger' || type === 'zipkin' || type === 'sapm' || 
               type === 'signalfx' || type === 'splunk_hec') {
      signals.push('traces');
    } else if (type === 'otlp' || type === 'opencensus' || type === 'kafka' || 
               type === 'file' || type === 'logging' || type === 'debug') {
      // OTLP, OpenCensus, Kafka, File, Logging, Debug can handle all signals
      signals.push('logs', 'metrics', 'traces');
    } else {
      // Default: assume all signals
      signals.push('logs', 'metrics', 'traces');
    }
  }
  
  return signals;
};

export const getAvailableSignals = (
  receivers: any[],
  processors: any[],
  exporters: any[],
  getComponentSignalsFn: (component: any, componentType: 'receiver' | 'processor' | 'exporter') => string[]
): { logs: boolean; metrics: boolean; traces: boolean } => {
  if (receivers.length === 0 && processors.length === 0 && exporters.length === 0) {
    return { logs: true, metrics: true, traces: true };
  }

  const receiverSignals = receivers.length > 0 
    ? receivers.map(r => getComponentSignalsFn(r, 'receiver')).reduce((acc, signals) => {
        signals.forEach(s => acc.add(s));
        return acc;
      }, new Set<string>())
    : new Set(['logs', 'metrics', 'traces']);

  const processorSignals = processors.length > 0
    ? processors.map(p => getComponentSignalsFn(p, 'processor')).reduce((acc, signals) => {
        signals.forEach(s => acc.add(s));
        return acc;
      }, new Set<string>())
    : new Set(['logs', 'metrics', 'traces']);

  const exporterSignals = exporters.length > 0
    ? exporters.map(e => getComponentSignalsFn(e, 'exporter')).reduce((acc, signals) => {
        signals.forEach(s => acc.add(s));
        return acc;
      }, new Set<string>())
    : new Set(['logs', 'metrics', 'traces']);

  // Intersect all signals - only signals supported by all component types
  const available: { logs: boolean; metrics: boolean; traces: boolean } = {
    logs: receiverSignals.has('logs') && processorSignals.has('logs') && exporterSignals.has('logs'),
    metrics: receiverSignals.has('metrics') && processorSignals.has('metrics') && exporterSignals.has('metrics'),
    traces: receiverSignals.has('traces') && processorSignals.has('traces') && exporterSignals.has('traces'),
  };

  return available;
};

export const isValidHostPort = (value?: string | null): boolean => {
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

export const isValidHttpUrl = (value?: string | null): boolean => {
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

export type CRDSettings = {
  name: string;
  namespace: string;
  mode: 'deployment' | 'daemonset' | 'statefulset' | 'sidecar';
  replicas: number;
  image: string;
  managementState: 'managed' | 'unmanaged';
  upgradeStrategy: 'automatic' | 'none';
  resources: {
    requests: {
      cpu: string;
      memory: string;
    };
    limits: {
      cpu: string;
      memory: string;
    };
  };
  advancedYaml: string;
};

export const validateCRDSettings = (opts: {
  includeDeploymentSettings: boolean;
  crdSettings: CRDSettings;
  isNewCollector: boolean;
  canModifyDeploymentSettings: boolean;
}): string[] => {
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

export const parseConfigYAML = (
  yamlConfig: string,
  setReceivers: (receivers: any[]) => void,
  setProcessors: (processors: any[]) => void,
  setExporters: (exporters: any[]) => void,
  registerDiscoveredTypes: (category: ComponentCategory, discovered: Array<{ type: string; sample?: any }>) => void,
  setSelectedSignals: (signals: { logs: boolean; metrics: boolean; traces: boolean }) => void,
  setGeneratedConfig: (config: string) => void,
  setRawYAMLConfig: (config: string) => void,
  setExpandedComponents: (keys: Set<string>) => void
): boolean => {
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

