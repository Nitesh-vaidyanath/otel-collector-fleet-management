import React from 'react';
import { PanelPlugin, PanelProps } from '@grafana/data';
import { PipelineMetricsPanelView, PipelineMetricQueries, buildDefaultMetricQueries } from '../../components/PipelineMetricsPanelView';

type PipelineMetricsPanelOptions = {
  pipelineType: string;
  agentUid?: string;
  agentName?: string;
  orgName?: string;
  datasourceUid?: string | null;
  queries?: PipelineMetricQueries;
};

const defaultOptions: PipelineMetricsPanelOptions = {
  pipelineType: 'metrics',
  agentUid: '',
  agentName: '',
  orgName: '',
  datasourceUid: null,
  queries: buildDefaultMetricQueries('metrics'),
};

const PipelineMetricsPanel: React.FC<PanelProps<PipelineMetricsPanelOptions>> = ({ options, width, height, onOptionsChange }) => {
  const style: React.CSSProperties = {
    width: width ? `${width}px` : '100%',
    height: height ? `${height}px` : '100%',
    overflowY: 'auto',
  };

  const handleDatasourceChange = (datasource: { uid: string } | null) => {
    onOptionsChange({
      ...options,
      datasourceUid: datasource?.uid ?? null,
    });
  };

  const handleQueriesChange = (next: PipelineMetricQueries) => {
    onOptionsChange({
      ...options,
      queries: next,
    });
  };

  return (
    <div style={style}>
      <PipelineMetricsPanelView
        pipelineType={options.pipelineType || 'metrics'}
        agentUid={options.agentUid}
        agentName={options.agentName}
        orgName={options.orgName}
        allowDisable={false}
        initialEnabled
        defaultDatasourceUid={options.datasourceUid ?? null}
        defaultQueries={options.queries ?? buildDefaultMetricQueries(options.pipelineType || 'metrics', options.agentUid)}
        readOnly={false}
        onDatasourceChange={handleDatasourceChange}
        onQueriesChange={handleQueriesChange}
      />
    </div>
  );
};

export const plugin = new PanelPlugin<PipelineMetricsPanelOptions>(PipelineMetricsPanel).setPanelOptions((builder) => {
  builder
    .addTextInput({
      path: 'pipelineType',
      name: 'Pipeline identifier',
      defaultValue: defaultOptions.pipelineType,
    })
    .addTextInput({
      path: 'agentUid',
      name: 'Agent UID',
      description: 'Optional UID to substitute in default queries.' ,
      defaultValue: defaultOptions.agentUid,
    })
    .addTextInput({
      path: 'agentName',
      name: 'Agent name',
      description: 'Display hint for users configuring queries.',
      defaultValue: defaultOptions.agentName,
    })
    .addTextInput({
      path: 'orgName',
      name: 'Organization name',
      defaultValue: defaultOptions.orgName,
    });
  return builder;
});
