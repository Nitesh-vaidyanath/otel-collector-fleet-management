import React from 'react';

export type TelemetryToggleCardProps = {
  title: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
  datasourceLabel?: string;
  footerNote?: string;
  onToggle: () => void;
  onConfigure: () => void;
};

export const TelemetryToggleCard: React.FC<TelemetryToggleCardProps> = ({ 
  title, 
  description, 
  enabled, 
  disabled, 
  datasourceLabel, 
  footerNote, 
  onToggle, 
  onConfigure 
}) => (
  <div
    style={{
      flex: '1 1 280px',
      minWidth: 260,
      padding: 16,
      borderRadius: 10,
      border: '1px solid #E5E7EB',
      background: enabled ? '#EEF2FF' : '#FFFFFF',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}
  >
    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{title}</div>
    <div style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.6 }}>{description}</div>
    {datasourceLabel && (
      <div style={{ fontSize: 12, color: '#1F2937', fontWeight: 500 }}>{datasourceLabel}</div>
    )}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#1F2937', flexWrap: 'wrap', gap: 8 }}>
      <span>Status: <strong>{enabled ? 'Enabled' : 'Disabled'}</strong></span>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" checked={enabled} disabled={disabled} onChange={onToggle} />
        <span>{enabled ? 'Disable' : 'Enable'}</span>
      </label>
    </div>
    <button
      type="button"
      onClick={onConfigure}
      disabled={disabled}
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        border: '1px solid #2563EB',
        background: disabled ? '#BFDBFE' : '#2563EB',
        color: disabled ? '#1D4ED8' : '#FFFFFF',
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s ease',
      }}
    >
      Configure
    </button>
    {footerNote && (
      <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.4 }}>{footerNote}</div>
    )}
  </div>
);

