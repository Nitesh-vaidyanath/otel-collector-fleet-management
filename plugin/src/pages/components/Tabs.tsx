import React from 'react';
import type { Tab } from '../types';

interface TabsProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  totalCollectorsDisplay: number;
}

export const Tabs: React.FC<TabsProps> = ({ activeTab, onTabChange, totalCollectorsDisplay }) => {
  const tabs = [
    { id: 'collectors' as Tab, label: 'Collectors', icon: '📦' },
    { id: 'configurations' as Tab, label: 'Configurations', icon: '⚙️' },
    { id: 'monitoring' as Tab, label: 'Monitoring', icon: '📊' },
  ];

  return (
    <div style={{
      background: 'white',
      borderBottom: '1px solid #E5E7EB',
      padding: '0 24px',
      display: 'flex',
      gap: 32
    }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            padding: '12px 0',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === tab.id ? '2px solid #3B82F6' : '2px solid transparent',
            color: activeTab === tab.id ? '#3B82F6' : '#6B7280',
            fontSize: 14,
            fontWeight: activeTab === tab.id ? 600 : 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s'
          }}
        >
          <span>{tab.icon}</span>
          {tab.label}
          {tab.id === 'collectors' && (
            <span style={{
              background: activeTab === tab.id ? '#3B82F6' : '#D1D5DB',
              color: 'white',
              padding: '2px 6px',
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 600,
              marginLeft: 4
            }}>
              {totalCollectorsDisplay}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

