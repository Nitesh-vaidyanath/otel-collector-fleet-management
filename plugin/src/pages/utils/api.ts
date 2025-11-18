import { getBackendSrv } from '@grafana/runtime';
import { lastValueFrom } from 'rxjs';
import { normalizeUrl } from './runtime';
import type { FetchOptions, GrafanaTransport } from '../types';

const rawBackendSrv = getBackendSrv();

let tenantHeaderValue: string | null = null;

export const setTenantHeaderValue = (value?: string | null) => {
  tenantHeaderValue = value && value.trim() ? value.trim() : null;
};

export const normalizeRequestHeaders = (incoming?: HeadersInit | Record<string, string>): Record<string, string> => {
  if (!incoming) {
    return {};
  }
  if (incoming instanceof Headers) {
    const headers: Record<string, string> = {};
    incoming.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }
  if (Array.isArray(incoming)) {
    return incoming.reduce<Record<string, string>>((acc, [key, value]) => {
      if (key) {
        acc[key] = String(value ?? '');
      }
      return acc;
    }, {});
  }
  return { ...(incoming as Record<string, string>) };
};

const fetchWithAuth = async <T = any>({ responseType, headers: requestHeaders, ...rest }: Record<string, any>): Promise<T> => {
  const headers = normalizeRequestHeaders(requestHeaders);
  if (tenantHeaderValue && !headers['X-Scoper-Tenant']) {
    headers['X-Scoper-Tenant'] = tenantHeaderValue;
  }

  const requestPayload = {
    responseType: (responseType as any) ?? 'json',
    ...rest,
    headers,
  } as any;

  const response = await lastValueFrom(rawBackendSrv.fetch<T>(requestPayload));

  if (response.status >= 200 && response.status < 300) {
    return response.data;
  }

  const error: any = new Error(response.statusText || `Request failed with status ${response.status}`);
  error.status = response.status;
  error.statusText = response.statusText;
  error.data = response.data;
  throw error;
};

// Factory function to create backendSrv with runtime context
export const createBackendSrv = (isRunningInGrafana: boolean, grafanaTransport: GrafanaTransport) => ({
  get: <T = any>(url: string, options: FetchOptions = {}) =>
    fetchWithAuth<T>({ ...options, url: normalizeUrl(url, isRunningInGrafana, grafanaTransport), method: 'GET' }),
  post: <T = any>(url: string, data?: any, options: FetchOptions = {}) =>
    fetchWithAuth<T>({ ...options, url: normalizeUrl(url, isRunningInGrafana, grafanaTransport), data, method: 'POST' }),
  delete: <T = any>(url: string, options: FetchOptions = {}) =>
    fetchWithAuth<T>({ ...options, url: normalizeUrl(url, isRunningInGrafana, grafanaTransport), method: 'DELETE' }),
  patch: <T = any>(url: string, data?: any, options: FetchOptions = {}) =>
    fetchWithAuth<T>({ ...options, url: normalizeUrl(url, isRunningInGrafana, grafanaTransport), data, method: 'PATCH' }),
  request: <T = any>(options: Record<string, any>) =>
    fetchWithAuth<T>({
      ...options,
      url: normalizeUrl(options.url ?? '', isRunningInGrafana, grafanaTransport),
      method: options.method,
    }),
});

