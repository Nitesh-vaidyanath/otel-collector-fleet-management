const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const esbuild = require('esbuild');
const { transformToAmd } = require('./build.js');

function loadTypeScript(entry) {
  const result = esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false });
  const module = { exports: {} };
  new Function('module', 'exports', result.outputFiles[0].text)(module, module.exports);
  return module.exports;
}

const promql = loadTypeScript(path.join(__dirname, '..', 'pages/utils/promql.ts'));
const org = loadTypeScript(path.join(__dirname, '..', 'pages/utils/telemetryOrg.ts'));

test('metric suggestion fills an empty query and replaces one metric token inside wrappers', () => {
  assert.deepEqual(promql.insertMetricSuggestion('', 'otelcol_a_total'), { query: 'otelcol_a_total', changed: true });
  const current = 'sum(rate(old_metric{job="collector"}[5m]))';
  assert.equal(promql.insertMetricSuggestion(current, 'new_metric').query, 'sum(rate(new_metric{job="collector"}[5m]))');
});

test('metric suggestions leave ambiguous compound expressions unchanged', () => {
  const input = 'sum(rate(first_metric[5m])) + sum(rate(second_metric[5m]))';
  const result = promql.insertMetricSuggestion(input, 'new_metric');
  assert.equal(result.query, input);
  assert.equal(result.changed, false);
  assert.ok(result.hint);
});

test('label matcher is inserted into the selector and preserves wrappers, ranges, and quoted values', () => {
  assert.equal(
    promql.insertLabelMatcher('sum(rate(foo{job="a,b",env="prod"}[5m]))', 'cluster').query,
    'sum(rate(foo{job="a,b",env="prod", cluster=""}[5m]))'
  );
  assert.equal(promql.insertLabelMatcher('sum(rate(foo[5m]))', 'cluster').query, 'sum(rate(foo{cluster=""}[5m]))');
  assert.equal(promql.insertLabelMatcher('foo{job="x"}', 'cluster').query, 'foo{job="x", cluster=""}');
  assert.equal(promql.insertLabelMatcher('foo{}', 'cluster').query, 'foo{cluster=""}');
  assert.equal(promql.insertLabelMatcher('foo{job="x",}', 'cluster').query, 'foo{job="x", cluster=""}');
  assert.equal(promql.insertLabelMatcher('foo{job="escaped\\\"value"}', 'cluster').query, 'foo{job="escaped\\\"value", cluster=""}');
});

test('invalid and duplicate label suggestions are conservative', () => {
  assert.equal(promql.insertLabelMatcher('foo{job="x"}', 'bad-label').changed, false);
  const duplicate = promql.insertLabelMatcher('foo{job="x"}', 'job');
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.query, 'foo{job="x"}');
  assert.match(duplicate.hint, /already contains job/);
});

test('bare and compound vector selectors are counted conservatively', () => {
  const changed = promql.insertMetricSuggestion('foo{job="x"}', 'bar');
  assert.equal(changed.query, 'bar{job="x"}');
  for (const input of ['sum(rate(a{}[5m])) + b{}', 'sum(rate(a{}[5m])) + sum(rate(b{}[5m]))', 'a{} + b', 'sum(rate(a[5m])) + b']) {
    const result = promql.insertMetricSuggestion(input, 'new_metric');
    assert.equal(result.changed, false);
    assert.equal(result.query, input);
  }
});

test('null/current and alternate datasource org selection is resolved without persisting current org', () => {
  for (const config of [{ datasourceOrgId: null }, { datasourceOrgId: undefined }]) {
    assert.equal(org.resolveDatasourceOrgId(config.datasourceOrgId, 7), 7);
    assert.equal(org.datasourceOrgSelectValue(config.datasourceOrgId, 7), '');
    assert.deepEqual(org.datasourceOrgHeaders(org.resolveDatasourceOrgId(config.datasourceOrgId, 7)), { headers: { 'X-Grafana-Org-Id': '7' } });
  }
  assert.equal(org.resolveDatasourceOrgId(7, 7), 7);
  assert.equal(org.datasourceOrgSelectValue(7, 7), '');
  assert.equal(org.resolveDatasourceOrgId(9, 7), 9);
  assert.equal(org.datasourceOrgSelectValue(9, 7), '9');
  assert.deepEqual(org.datasourceOrgHeaders(9), { headers: { 'X-Grafana-Org-Id': '9' } });
});

test('latest-request epochs prevent stale org, datasource, and closed-drawer results from owning state', () => {
  const datasource = org.createRequestEpoch();
  let value = '';
  const requestA = datasource.begin();
  const requestB = datasource.begin();
  if (datasource.isCurrent(requestB)) value = 'org-B';
  if (datasource.isCurrent(requestA)) value = 'org-A';
  assert.equal(value, 'org-B');

  const metadata = org.createRequestEpoch();
  const oldDatasource = metadata.begin();
  metadata.begin(); // A new datasource invalidates old metadata.
  if (metadata.isCurrent(oldDatasource)) value = 'old-metadata';
  assert.equal(value, 'org-B');
  const pendingAtClose = metadata.begin();
  metadata.invalidate(pendingAtClose);
  if (metadata.isCurrent(pendingAtClose)) value = 'closed-drawer-result';
  assert.equal(value, 'org-B');
});

test('datasource and metadata request ownership are independent', () => {
  const datasource = org.createRequestEpoch();
  const metadata = org.createRequestEpoch();
  const dsRequest = datasource.begin();
  const metaRequest = metadata.begin();
  datasource.begin();
  assert.equal(datasource.isCurrent(dsRequest), false);
  assert.equal(metadata.isCurrent(metaRequest), true);
});

test('AMD transform exposes the plugin and binds mocked React through its factory', () => {
  const source = `import React, { useState } from 'react'; export const plugin = { react: React, useState };`;
  const wrapped = transformToAmd(source);
  const react = { useState: () => 'mock-state' };
  let exported;
  vm.runInNewContext(wrapped, {
    define: (_dependencies, factory) => { exported = factory({}, {}, {}, react, {}); },
  });
  assert.ok(exported);
  assert.equal(exported.plugin.react, react);
  assert.equal(exported.plugin.useState, react.useState);
});

test('application and panel entries bundle in memory without writing build artifacts', () => {
  const entries = [
    path.join(__dirname, '..', 'module.ts'),
    path.join(__dirname, '..', 'panels/pipeline/module.tsx'),
  ];
  const result = esbuild.buildSync({
    entryPoints: entries,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outdir: '/virtual',
    write: false,
    external: ['@grafana/data', '@grafana/runtime', '@grafana/ui', 'react', 'react-dom'],
    loader: { '.ts': 'ts', '.tsx': 'tsx', '.css': 'css', '.svg': 'file', '.png': 'file', '.jpg': 'file', '.woff': 'file', '.woff2': 'file' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  assert.ok(result.outputFiles.length >= 2);
  const amd = transformToAmd(result.outputFiles.find((output) => output.path.endsWith('module.js')).text);
  assert.match(amd, /^define\(\["@grafana\/data"/);
  assert.match(amd, /return \{ plugin: plugin \};/);
});
