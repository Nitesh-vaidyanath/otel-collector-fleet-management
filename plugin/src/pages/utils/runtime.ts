import { DEFAULT_OPAMP_WS, RESOURCE_PREFIX, PROXY_PREFIX, STANDALONE_PREFIX, GRAFANA_CORE_ENDPOINTS, PLUGIN_ID, RESOURCE_ROOT } from '../constants';
import type { RuntimeMode, GrafanaTransport } from '../types';

export const detectRuntimeMode = (): RuntimeMode => {
  if (typeof window === 'undefined') {
    return 'grafana';
  }

  const coerceMode = (value: string | null | undefined): RuntimeMode | null => {
    if (!value) {
      return null;
    }
    const lower = value.toLowerCase();
    if (lower === 'grafana' || lower === 'standalone') {
      return lower as RuntimeMode;
    }
    return null;
  };

  let storedMode: string | null = null;
  try {
    storedMode = window.localStorage?.getItem('otelFleetAppMode') ?? null;
  } catch {
    storedMode = null;
  }

  const forcedMode =
    coerceMode((window as any).__OTEL_FLEET_APP_MODE__) ||
    coerceMode(new URLSearchParams(window.location.search).get('mode')) ||
    coerceMode(storedMode);
  if (forcedMode) {
    return forcedMode;
  }

  const grafanaMarkers = [
    (window as any).__grafanaBootData,
    (window as any).grafanaBootData,
    (window as any).__grafana_public_path__,
  ];
  if (grafanaMarkers.some(Boolean)) {
    return 'grafana';
  }

  if (typeof document !== 'undefined') {
    const grafanaRoot =
      document.getElementById('grafana-app') ||
      document.getElementById('grafanaRoot') ||
      document.querySelector('grafana-app');
    if (grafanaRoot) {
      return 'grafana';
    }
  }

  const path = window.location?.pathname ?? '';
  if (path.includes('/api/plugins/') || path.includes('/a/')) {
    return 'grafana';
  }

  return 'standalone';
};

export const detectGrafanaTransport = (isRunningInGrafana: boolean): GrafanaTransport => {
  if (!isRunningInGrafana) {
    return 'resources';
  }

  const coerce = (value: string | null | undefined): GrafanaTransport | null => {
    if (!value) {
      return null;
    }
    const lower = value.toLowerCase();
    if (lower === 'proxy' || lower === 'resources') {
      return lower as GrafanaTransport;
    }
    if (lower === 'callresource') {
      return 'resources';
    }
    return null;
  };

  let stored: string | null = null;
  try {
    stored = window.localStorage?.getItem('otelFleetTransport') ?? null;
  } catch {
    stored = null;
  }

  return (
    coerce((window as any).__OTEL_FLEET_TRANSPORT__) ||
    coerce(new URLSearchParams(window.location.search).get('transport')) ||
    coerce(stored) ||
    'proxy'
  );
};

export const normalizeUrl = (rawUrl: string, isRunningInGrafana: boolean, grafanaTransport: GrafanaTransport): string => {
  if (!rawUrl) {
    if (!isRunningInGrafana) {
      return STANDALONE_PREFIX;
    }
    return grafanaTransport === 'proxy' ? PROXY_PREFIX : RESOURCE_PREFIX;
  }

  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    return rawUrl;
  }

  if (GRAFANA_CORE_ENDPOINTS.some((prefix) => rawUrl.startsWith(prefix))) {
    return rawUrl;
  }

  const base = !isRunningInGrafana
    ? STANDALONE_PREFIX
    : grafanaTransport === 'proxy'
      ? PROXY_PREFIX
      : RESOURCE_PREFIX;

  let urlWithoutBase = rawUrl;
  if (urlWithoutBase.startsWith(base)) {
    return urlWithoutBase;
  }
  if (urlWithoutBase.startsWith(RESOURCE_PREFIX)) {
    urlWithoutBase = urlWithoutBase.slice(RESOURCE_PREFIX.length);
  } else if (urlWithoutBase.startsWith(RESOURCE_ROOT)) {
    urlWithoutBase = urlWithoutBase.slice(RESOURCE_ROOT.length);
  } else if (urlWithoutBase.startsWith(PROXY_PREFIX)) {
    urlWithoutBase = urlWithoutBase.slice(PROXY_PREFIX.length);
  } else if (urlWithoutBase.startsWith(STANDALONE_PREFIX)) {
    urlWithoutBase = urlWithoutBase.slice(STANDALONE_PREFIX.length);
  } else if (urlWithoutBase.startsWith(`/api/plugins/${PLUGIN_ID}/resources`)) {
    const parts = urlWithoutBase.split('/resources');
    if (parts.length > 1) {
      urlWithoutBase = parts.slice(1).join('/resources');
    }
  }

  urlWithoutBase = urlWithoutBase.replace(/^\/plugin-api(\/|$)/, '/');
  urlWithoutBase = urlWithoutBase.replace(/^\/r(\/|$)/, '/');
  if (!urlWithoutBase.startsWith('/')) {
    urlWithoutBase = `/${urlWithoutBase}`;
  }

  return `${base}${urlWithoutBase}`;
};

