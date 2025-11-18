import React from 'react';
import { capabilityOrder } from '../constants';
import type { CapabilityDescriptor } from '../types';

const { useMemo } = React;

export const capabilityMeta: Record<string, CapabilityDescriptor> = {
  accepts_remote_config: {
    label: 'Remote Config',
    description: 'Accepts remote configuration updates pushed via OpAMP.',
    icon: '⚙️',
    tone: { bg: '#EEF2FF', border: '#C7D2FE', color: '#3730A3' },
  },
  reports_effective_config: {
    label: 'Reports Config',
    description: 'Reports effective configuration back to the OpAMP server.',
    icon: '🧾',
    tone: { bg: '#ECFDF5', border: '#A7F3D0', color: '#065F46' },
  },
  reports_health: {
    label: 'Health',
    description: 'Sends health status updates (required for health widget).',
    icon: '❤️',
    tone: { bg: '#FEF2F2', border: '#FECACA', color: '#991B1B' },
  },
  reports_own_logs: {
    label: 'Logs',
    description: 'Streams self-observed logs via OpAMP telemetry endpoint.',
    icon: '📜',
    tone: { bg: '#FDF2F8', border: '#FBCFE8', color: '#9D174D' },
  },
  reports_own_metrics: {
    label: 'Metrics',
    description: 'Streams self-observed metrics via OpAMP telemetry endpoint.',
    icon: '📈',
    tone: { bg: '#ECFEFF', border: '#BAE6FD', color: '#0C4A6E' },
  },
  reports_own_traces: {
    label: 'Traces',
    description: 'Streams self-observed traces via OpAMP telemetry endpoint.',
    icon: '🛰️',
    tone: { bg: '#FFF7ED', border: '#FED7AA', color: '#9A3412' },
  },
  accepts_restart_command: {
    label: 'Restart Cmd',
    description: 'Can be restarted remotely from the OpAMP server.',
    icon: '🔁',
    tone: { bg: '#E0E7FF', border: '#C7D2FE', color: '#312E81' },
  },
  reports_remote_config: {
    label: 'Config Status',
    description: 'Reports remote configuration hashes/status for auditing.',
    icon: '🛰️',
    tone: { bg: '#F3F4F6', border: '#E5E7EB', color: '#111827' },
  },
  reports_status: {
    label: 'Agent Status',
    description: 'Sends regular status updates (uptime, metadata, etc.).',
    icon: '📡',
    tone: { bg: '#F0FDFA', border: '#99F6E4', color: '#115E59' },
  },
  reports_available_components: {
    label: 'Component Inventory',
    description: 'Reports available receivers/processors/exporters.',
    icon: '🧩',
    tone: { bg: '#EFF6FF', border: '#BFDBFE', color: '#1E3A8A' },
  },
};

export const isCapabilityEnabled = (value: any): boolean => {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1';
  }
  return true;
};

export const CapabilityBadges: React.FC<{
  capabilities?: Record<string, any>;
  limit?: number;
  compact?: boolean;
  onOpenDetails?: () => void;
}> = ({
  capabilities,
  limit = 5,
  compact = false,
  onOpenDetails,
}) => {
  const badges = useMemo(() => {
    if (!capabilities || typeof capabilities !== 'object') {
      return [];
    }
    const enabled: Array<{ key: string; meta: CapabilityDescriptor }> = [];
    for (const key of capabilityOrder) {
      if (isCapabilityEnabled(capabilities[key])) {
        const meta = capabilityMeta[key];
        if (meta) {
          enabled.push({ key, meta });
        }
      }
    }
    return enabled;
  }, [capabilities]);

  const visible = badges.slice(0, limit);
  const remaining = badges.length - visible.length;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {visible.map(({ key, meta }) => (
        <span
          key={key}
          title={meta.description}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: compact ? '2px 6px' : '4px 8px',
            borderRadius: 6,
            fontSize: compact ? 10 : 11,
            fontWeight: 500,
            background: meta.tone.bg,
            border: `1px solid ${meta.tone.border}`,
            color: meta.tone.color,
            cursor: onOpenDetails ? 'pointer' : 'default',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetails?.();
          }}
        >
          <span>{meta.icon}</span>
          {!compact && <span>{meta.label}</span>}
        </span>
      ))}
      {remaining > 0 && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: compact ? '2px 6px' : '4px 8px',
            borderRadius: 6,
            fontSize: compact ? 10 : 11,
            fontWeight: 500,
            background: '#F3F4F6',
            border: '1px solid #E5E7EB',
            color: '#6B7280',
            cursor: onOpenDetails ? 'pointer' : 'default',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetails?.();
          }}
        >
          +{remaining} more
        </span>
      )}
    </div>
  );
};
