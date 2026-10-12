const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
const { chromium } = require('playwright');
const { transformToAmd } = require('./build.js');

test('synthetic telemetry drawer fences stale org and metadata responses without network access', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/*', (route) => route.abort());
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../node_modules/react/umd/react.development.js'), 'utf8') });
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../node_modules/react-dom/umd/react-dom.development.js'), 'utf8') });
    await page.evaluate(() => { window.__requests = []; });
    await page.addScriptTag({ content: `
      window.__requests = [];
      window.__metadataCalls = 0;
      window.__apiRequest = (request) => new Promise((resolve, reject) => {
        const org = request.headers && request.headers['X-Grafana-Org-Id'];
        window.__requests.push({ url: request.url, org });
        const datasourceList = request.url.endsWith('/api/datasources');
        const metricMetadata = request.url.includes('/api/v1/label/');
        const metadataCall = metricMetadata ? ++window.__metadataCalls : 0;
        const delay = datasourceList && org === '7' ? 120 : metricMetadata && org === '7' && metadataCall === 2 ? 300 : metricMetadata ? 160 : 0;
        setTimeout(() => {
          if (metricMetadata && (org === '9' || (org === '7' && metadataCall === 2))) {
            reject(new Error('stale metadata error'));
            return;
          }
          if (datasourceList) {
            resolve([{ id: Number(org) * 10, uid: 'prom-' + org, name: 'Prom ' + org, type: 'prometheus' }, { id: Number(org) * 10 + 1, uid: 'loki-' + org, name: 'Loki ' + org, type: 'loki' }]);
          } else if (request.url.includes('/api/v1/label/')) {
            resolve({ data: ['metric_' + org + '_' + metadataCall] });
          } else if (request.url.endsWith('/api/v1/labels')) {
            resolve({ data: ['label_' + org] });
          } else {
            resolve([]);
          }
        }, delay);
      });
    ` });

    const source = `
      import React from 'react';
      import * as ReactDOM from 'react-dom';
      import { TelemetryConfigDrawer } from './pages/components/TelemetryConfigDrawer';
      const root = ReactDOM.createRoot(document.getElementById('root'));
      function Harness() {
        const [open, setOpen] = React.useState(true);
        const [mode, setMode] = React.useState('metrics');
        const [metrics, setMetrics] = React.useState({ enabled: false, datasourceUid: null, datasourceOrgId: null, queries: { receivers: 'foo{}', processors: '', exporters: '' }, stageQueries: { receivers: { inbound: '', outbound: '' }, processors: { inbound: '', outbound: '' }, exporters: { inbound: '', outbound: '' } } });
        const [logs, setLogs] = React.useState({ enabled: false, datasourceUid: null, datasourceOrgId: null, query: '' });
        window.__harness = { setOpen, setMode };
        return React.createElement(TelemetryConfigDrawer, {
          open, mode, metricsConfig: metrics, logsConfig: logs, currentOrgId: 7,
          orgOptions: [{ id: 7, name: 'Current' }, { id: 9, name: 'Alternate' }],
          onMetricsChange: setMetrics, onLogsChange: setLogs, onSave: () => {}, onClose: () => setOpen(false), saving: false, canSave: true,
        });
      }
      export const plugin = { mount: () => root.render(React.createElement(Harness)) };
    `;
    const bundle = await esbuild.build({
      stdin: { contents: source, resolveDir: path.join(__dirname, '..'), sourcefile: 'telemetry-harness.tsx', loader: 'tsx' },
      bundle: true,
      platform: 'browser',
      format: 'esm',
      write: false,
      jsx: 'transform',
      external: ['@grafana/data', '@grafana/runtime', '@grafana/ui', 'react', 'react-dom'],
    });
    const amdSource = transformToAmd(bundle.outputFiles[0].text);
    assert.match(amdSource, /^define\(/);
    try { new vm.Script(amdSource); } catch (error) { throw new Error(`AMD syntax invalid: ${error.stack}`); }
    await page.evaluate(() => { window.define = (_dependencies, factory) => { window.__amdFactory = factory; }; });
    await page.addScriptTag({ content: amdSource });
    const factoryType = await page.evaluate(() => typeof window.__amdFactory);
    assert.equal(factoryType, 'function', `AMD factory missing; page errors: ${pageErrors.join('; ')}`);
    await page.evaluate(() => {
      const runtime = {
        getBackendSrv: () => ({
          fetch: (request) => ({
            subscribe(observer) {
              window.__apiRequest(request).then((data) => {
                observer.next({ status: 200, data });
                observer.complete();
              }, (error) => observer.error(error));
              return { unsubscribe() {} };
            },
          }),
        }),
      };
      window.__plugin = window.__amdFactory({}, runtime, {}, window.React, window.ReactDOM).plugin;
      window.__plugin.mount();
    });
    await page.waitForTimeout(100);
    const initialMarkup = await page.locator('#root').innerHTML();
    assert.notEqual(initialMarkup, '', `drawer did not mount; page errors: ${pageErrors.join('; ')}`);
    const orgSelect = page.locator('label').filter({ hasText: 'Datasource org' }).locator('select').first();
    assert.equal(await orgSelect.inputValue(), '', 'null setting should display Current org as blank');
    await orgSelect.selectOption('9');
    await page.waitForTimeout(180);
    const datasourceSelect = page.locator('label').filter({ hasText: 'Data source' }).locator('select').first();
    assert.ok((await datasourceSelect.locator('option').allTextContents()).some((text) => text.includes('Prom 9')));
    assert.ok(!(await datasourceSelect.locator('option').allTextContents()).some((text) => text.includes('Prom 7')));
    await datasourceSelect.selectOption('prom-9');
    await orgSelect.selectOption('');
    await page.waitForTimeout(200);
    assert.equal(await page.getByRole('button', { name: 'metric_9_1' }).count(), 0, 'stale metadata from old org must not appear');
    assert.equal(await page.getByText('stale metadata error').count(), 0, 'stale metadata errors must not own the current org');
    const metricsHeaders = await page.evaluate(() => window.__requests.filter((request) => request.url.endsWith('/api/datasources')).map((request) => request.org));
    assert.ok(metricsHeaders.includes('7') && metricsHeaders.includes('9'));

    await page.waitForFunction(() => Array.from(document.querySelectorAll('option')).some((option) => option.value === 'prom-7'));
    await datasourceSelect.selectOption('prom-7');
    await page.getByRole('button', { name: 'Close telemetry configuration' }).click();
    await page.evaluate(() => window.__harness.setOpen(true));
    await page.getByRole('button', { name: 'metric_7_3' }).first().waitFor({ state: 'visible' });
    await page.waitForTimeout(350);
    assert.equal(await page.getByText('stale metadata error').count(), 0, 'metadata rejected after close must not overwrite reopened state');

    await page.evaluate(() => window.__harness.setMode('logs'));
    await page.waitForTimeout(30);
    const logsOrg = page.locator('label').filter({ hasText: 'Datasource org' }).locator('select').first();
    assert.equal(await logsOrg.inputValue(), '', 'null logs org should also display Current org as blank');
    await logsOrg.selectOption('9');
    await page.waitForTimeout(30);
    const logHeaders = await page.evaluate(() => window.__requests.filter((request) => request.url.endsWith('/api/datasources')).map((request) => request.org));
    assert.ok(logHeaders.includes('9'), 'alternate logs org request should carry its explicit org ID');
    assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join('; ')}`);
  } finally {
    await browser.close();
  }
});
