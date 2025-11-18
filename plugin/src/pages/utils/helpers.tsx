// Shared helper functions
import React from 'react';

export const normalizeTelemetryItems = (items?: any[]) => {
  if (!Array.isArray(items)) {
    return [] as Array<{
      recorded_at: string | null;
      cpu_percent: number | null;
      memory_bytes: number | null;
      inbound_bandwidth_kbps: number | null;
      outbound_bandwidth_kbps: number | null;
      pipelines: any;
    }>;
  }
  return items.map((item) => {
    const payload = item?.data ?? item ?? {};
    return {
      recorded_at: item?.recorded_at || item?.reported_at || payload?.recorded_at || payload?.reported_at || null,
      cpu_percent: payload?.cpu_percent ?? null,
      memory_bytes: payload?.memory_bytes ?? null,
      inbound_bandwidth_kbps: payload?.inbound_bandwidth_kbps ?? null,
      outbound_bandwidth_kbps: payload?.outbound_bandwidth_kbps ?? null,
      pipelines: payload?.pipelines ?? payload?.pipelines_json ?? null,
    };
  });
};

export const getStatusBadge = (status: string) => {
  const styles = {
    online: { bg: '#10B981', color: 'white', icon: '●' },
    offline: { bg: '#EF4444', color: 'white', icon: '●' },
    degraded: { bg: '#F59E0B', color: 'white', icon: '⚠' },
    unknown: { bg: '#6B7280', color: 'white', icon: '●' },
  };
  const s = styles[status as keyof typeof styles] || styles.unknown;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 500,
      background: s.bg,
      color: s.color,
    }}>
      <span style={{ fontSize: 8 }}>{s.icon}</span>
      {status}
    </span>
  );
};

