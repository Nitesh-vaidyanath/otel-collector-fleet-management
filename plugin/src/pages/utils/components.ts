import type { ComponentCategory } from '../types';

export const builtinReceiverTemplates = [
  {
    value: 'otlp',
    label: 'OTLP (gRPC + HTTP)',
    description: 'Default OpenTelemetry receiver with gRPC (4317) and HTTP (4318) endpoints.',
    isSystem: true,
    isCustom: false,
    config: {
      protocols: {
        grpc: { endpoint: '0.0.0.0:4317' },
        http: { endpoint: '0.0.0.0:4318' },
      },
    },
  },
  {
    value: 'prometheus',
    label: 'Prometheus Scraper',
    description: 'Scrape metrics from Prometheus targets on port 9090 every 30s.',
    isSystem: true,
    isCustom: false,
    config: {
      config: {
        scrape_configs: [
          {
            job_name: 'otel-collector',
            scrape_interval: '30s',
            static_configs: [{ targets: ['0.0.0.0:9090'] }],
          },
        ],
      },
    },
  },
];

export const builtinProcessorTemplates = [
  {
    value: 'batch',
    label: 'Batch',
    description: 'Recommended batch processor with sane defaults.',
    isSystem: true,
    isCustom: false,
    config: {
      send_batch_size: 8192,
      timeout: '10s',
    },
  },
  {
    value: 'memory_limiter',
    label: 'Memory Limiter',
    description: 'Prevents the collector from running out of memory.',
    isSystem: true,
    isCustom: false,
    config: {
      check_interval: '2s',
      limit_percentage: 75,
      spike_limit_percentage: 15,
    },
  },
];

export const builtinExporterTemplates = [
  {
    value: 'otlp',
    label: 'OTLP (HTTP)',
    description: 'Send data to an upstream OTLP endpoint over HTTP.',
    isSystem: true,
    isCustom: false,
    config: {
      endpoint: 'http://localhost:4318',
    },
  },
  {
    value: 'debug',
    label: 'Debug (logging)',
    description: 'Log telemetry payloads for troubleshooting.',
    isSystem: true,
    isCustom: false,
    config: {
      verbosity: 'basic',
    },
  },
];

export const customComponentOption = {
  value: 'custom',
  label: 'Custom (YAML)',
  config: {},
  isSystem: false,
  isCustom: true,
};

export const mergeComponentTypeLists = (
  fetched: any[],
  fallback: any[]
) => {
  const merged = new Map<string, any>();

  [...(fetched || []), ...(fallback || [])].forEach((item: any) => {
    if (!item) {
      return;
    }
    const key = item.value || item.type;
    if (!key) {
      return;
    }
    if (!merged.has(key)) {
      merged.set(key, {
        ...item,
        value: key,
        label: item.label || item.displayLabel || key,
        config: item.config || {},
      });
    }
  });

  const result = Array.from(merged.values());
  if (!result.some((t) => t.value === 'custom')) {
    result.push({ ...customComponentOption });
  }
  return result;
};

export const deriveComponentTypeFromName = (name?: string | null): string | null => {
  if (!name) {
    return null;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }
  const [base] = trimmed.split(/[/:]/, 1);
  return base?.trim() || null;
};

export const formatComponentLabel = (value: string): string => {
  if (!value) {
    return 'Custom';
  }
  const cleaned = value.replace(/\//g, ' / ');
  return cleaned
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
};

export const cloneSampleConfig = (config: any): any => {
  if (!config || typeof config !== 'object') {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(config));
  } catch {
    return { ...config };
  }
};

export const inferReceiverTypeByStructure = (config: any): string | null => {
  if (!config || typeof config !== 'object') {
    return null;
  }
  const protocols = config.protocols || {};
  if (protocols.thrift_http || protocols.thrift_compact || protocols.thrift_binary) {
    return 'jaeger';
  }
  if (protocols.kafka || config.kafka) {
    return 'kafka';
  }
  if (protocols.grpc && protocols.http) {
    return 'otlp';
  }
  if (protocols.grpc && !protocols.http && !protocols.thrift_http && !protocols.thrift_compact) {
    return 'otlp';
  }
  if (config.scrape_configs || config.config?.scrape_configs) {
    return 'prometheus';
  }
  if (Array.isArray(config.include) || Array.isArray(config.exclude) || config.include || config.exclude) {
    return 'filelog';
  }
  if (config.endpoint && String(config.endpoint).includes('9411')) {
    return 'zipkin';
  }
  if (config.endpoint && String(config.endpoint).includes('14250')) {
    return 'jaeger';
  }
  if (config.endpoint && String(config.endpoint).includes('12347')) {
    return 'faro';
  }
  return null;
};

export const inferProcessorTypeByStructure = (config: any): string | null => {
  if (!config || typeof config !== 'object') {
    return null;
  }
  if (
    config.send_batch_size !== undefined ||
    config.send_batch_max_size !== undefined ||
    config.timeout !== undefined
  ) {
    return 'batch';
  }
  if (
    config.limit_mib !== undefined ||
    config.memory_limit_mib !== undefined ||
    config.spike_limit_mib !== undefined ||
    config.check_interval !== undefined
  ) {
    return 'memory_limiter';
  }
  if (config.actions !== undefined) {
    return 'attributes';
  }
  if (config.include || config.exclude) {
    return 'filter';
  }
  return null;
};

export const inferExporterTypeByStructure = (config: any): string | null => {
  if (!config || typeof config !== 'object') {
    return null;
  }
  if (config.endpoint) {
    const endpoint = String(config.endpoint);
    if (/4317|4318/.test(endpoint) || endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return 'otlp';
    }
    if (endpoint.includes('9411')) {
      return 'zipkin';
    }
    if (endpoint.includes('14250')) {
      return 'jaeger';
    }
  }
  if (config.loglevel !== undefined || config.verbosity !== undefined) {
    return 'debug';
  }
  if (config.prometheusremotewrite || config.namespace || config.collectd) {
    return 'prometheus';
  }
  return null;
};

export const inferComponentType = (category: ComponentCategory, name: string, config: any): string => {
  let structural: string | null = null;
  if (category === 'receiver') {
    structural = inferReceiverTypeByStructure(config);
  } else if (category === 'processor') {
    structural = inferProcessorTypeByStructure(config);
  } else if (category === 'exporter') {
    structural = inferExporterTypeByStructure(config);
  }
  if (structural) {
    return structural;
  }
  const fromName = deriveComponentTypeFromName(name);
  if (fromName) {
    return fromName;
  }
  return 'custom';
};

