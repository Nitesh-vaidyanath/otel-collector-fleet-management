import React from 'react';

interface HeaderProps {
  currentOrgName: string;
  selectedOrgId: number | null;
  displayUserName: string;
  userContext: { name: string; role: string; isAdmin: boolean };
  displayOrgBadge: string;
  refreshing: boolean;
  onRefresh: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentOrgName,
  selectedOrgId,
  displayUserName,
  userContext,
  displayOrgBadge,
  refreshing,
  onRefresh,
}) => {
  return (
    <div style={{
      background: 'white',
      borderBottom: '1px solid #E5E7EB',
      padding: '16px 24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: '#111827' }}>
            OTel Collector Agent Fleet Management
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <span style={{ fontSize: 14, color: '#6B7280' }}>Tenant:</span>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: '#EFF6FF',
            borderRadius: 6,
            border: '1px solid #BFDBFE',
            minWidth: 200
          }}>
            <span style={{ fontSize: 12, color: '#1E40AF', fontWeight: 600 }}>
              {currentOrgName || `Organization ${selectedOrgId ?? ''}`}
            </span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: '#F3F4F6',
            borderRadius: 6,
            border: '1px solid #E5E7EB'
          }}>
            <div style={{ fontSize: 12, color: '#4B5563' }}>
              <strong>User:</strong> {displayUserName}
            </div>
            <div style={{ fontSize: 12, color: userContext.isAdmin ? '#059669' : '#B45309', fontWeight: 600 }}>
              {userContext.role || (userContext.isAdmin ? 'Admin' : 'Viewer')}
            </div>
            <div style={{ fontSize: 12, color: '#4B5563' }}>
              <strong>Org:</strong> {displayOrgBadge}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
          Manage your OpenTelemetry Collector agents • Viewing agents for selected organization
        </div>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        style={{
          padding: '8px 16px',
          background: refreshing ? '#D1D5DB' : '#3B82F6',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          cursor: refreshing ? 'not-allowed' : 'pointer',
          fontSize: 14,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}
      >
        <span>{refreshing ? '⏳' : '↻'}</span>
        {refreshing ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
  );
};

