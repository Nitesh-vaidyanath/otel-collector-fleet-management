import { DEFAULT_OPAMP_WS } from '../constants';

export const normalizeOpampPath = (pathname?: string | null): string => {
  if (!pathname || pathname.trim() === '' || pathname === '/') {
    return '/v1/opamp';
  }
  const trimmed = pathname.replace(/\/+$/, '');
  if (trimmed.endsWith('/v1/opamp')) {
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }
  const normalized = `${trimmed}/v1/opamp`;
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
};

export const coerceWebsocketUrlFromServer = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    let protocol = parsed.protocol;
    if (protocol === 'http:') {
      protocol = 'ws:';
    } else if (protocol === 'https:') {
      protocol = 'wss:';
    } else if (protocol !== 'ws:' && protocol !== 'wss:') {
      protocol = 'ws:';
    }
    const path = normalizeOpampPath(parsed.pathname);
    const search = parsed.search ?? '';
    return `${protocol}//${parsed.host}${path}${search}`;
  } catch {
    // If parsing fails, fall through to other strategies
  }
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    const cleaned = trimmed.replace(/\/+$/, '');
    if (/\/v1\/opamp$/i.test(cleaned)) {
      return cleaned;
    }
    return `${cleaned}/v1/opamp`;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return coerceWebsocketUrlFromServer(trimmed);
  }
  return null;
};

export const coerceWebsocketUrlFromEndpoint = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return coerceWebsocketUrlFromServer(trimmed);
  }
  if (/^[\w\.\-]+:\d+$/.test(trimmed)) {
    const sanitized = trimmed.replace(/^0\.0\.0\.0/, 'localhost');
    return `ws://${sanitized}/v1/opamp`;
  }
  return null;
};

export const buildOpampConnectionUrl = (serverUrl?: string | null, endpoint?: string | null): string => {
  return (
    coerceWebsocketUrlFromServer(serverUrl) ??
    coerceWebsocketUrlFromEndpoint(endpoint) ??
    DEFAULT_OPAMP_WS
  );
};

