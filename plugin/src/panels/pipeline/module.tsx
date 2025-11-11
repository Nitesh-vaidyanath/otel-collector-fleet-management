import React from 'react';
import { PanelProps, PanelPlugin } from '@grafana/data';
import { PipelineMetricsPanelView, PipelineMetricQueries, createDefaultQueries } from './PanelView';

export interface PipelineMetricsPanelOptions {
  pipelineType: string;
  agentUid?: string;
  agentName?: string;
  orgName?: string;
  datasourceUid?: string;
  queries?: PipelineMetricQueries;
}

const defaultOptions: PipelineMetricsPanelOptions = {
  pipelineType: 'metrics',
  agentUid: '',
  agentName: '',
  orgName: '',
  datasourceUid: undefined,
  queries: createDefaultQueries('metrics'),
};

const PipelineMetricsPanel: React.FC<PanelProps<PipelineMetricsPanelOptions>> = ({ options, width, height, onOptionsChange }) => {
  const style: React.CSSProperties = {
    width: width ? `${width}px` : '100%',
    height: height ? `${height}px` : '100%',
    overflowY: 'auto',
  };

  return (
    <div style={style}>
      <PipelineMetricsPanelView
        pipelineType={options.pipelineType}
        agentUid={options.agentUid}
        agentName={options.agentName}
        orgName={options.orgName}
        defaultDatasourceUid={options.datasourceUid ?? null}
        defaultQueries={options.queries ?? createDefaultQueries(options.pipelineType, options.agentUid)}
        allowDisable={false}
        initialEnabled
        onQueriesChange={(next) => onOptionsChange({ ...options, queries: next })}
        onDatasourceChange={(ds) => onOptionsChange({ ...options, datasourceUid: ds?.uid })}
      />
    </div>
  );
};

export const plugin = new PanelPlugin<PipelineMetricsPanelOptions>(PipelineMetricsPanel).setPanelOptions((builder) => {
  builder
    .addTextInput({
      path: 'pipelineType',
      name: 'Pipeline name',
      description: 'Used to generate default queries and labels.',
      defaultValue: defaultOptions.pipelineType,
    })
    .addTextInput({
      path: 'agentUid',
      name: 'Agent UID',
      description: 'Optional: used in default query templates.',
      defaultValue: defaultOptions.agentUid,
    })
    .addTextInput({
      path: 'agentName',
      name: 'Agent name',
      description: 'Optional: display hint for query authors.',
      defaultValue: defaultOptions.agentName,
    })
    .addTextInput({
      path: 'orgName',
      name: 'Organization name',
      description: 'Optional: display hint for query authors.',
      defaultValue: defaultOptions.orgName,
    })
    .addTextInput({
      path: 'datasourceUid',
      name: 'Default datasource UID',
      description: 'Optional: pre-select a Prometheus-compatible datasource by UID.',
      defaultValue: defaultOptions.datasourceUid,
    });
  return builder;
});

