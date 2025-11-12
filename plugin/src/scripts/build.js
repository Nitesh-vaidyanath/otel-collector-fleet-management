const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const distDir = path.resolve(__dirname, '..', '..', '..', 'dist');
const publicDir = path.join(distDir, 'public');

const grafanaExternals = ['@grafana/data', '@grafana/runtime', '@grafana/ui', 'react', 'react-dom'];
const loaders = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.css': 'css',
  '.ttf': 'file',
  '.woff': 'file',
  '.woff2': 'file',
  '.eot': 'file',
  '.svg': 'file',
  '.png': 'file',
  '.jpg': 'file',
  '.jpeg': 'file',
};

const entries = [
  {
    name: 'app',
    entry: path.resolve(__dirname, '..', 'module.ts'),
    outRelative: 'module.js',
    copyTarget: path.join(distDir, 'module.js'),
  },
  {
    name: 'pipeline-panel',
    entry: path.resolve(__dirname, '..', 'panels', 'pipeline', 'module.tsx'),
    outRelative: path.join('panels', 'pipeline', 'module.js'),
    copyTarget: path.join(distDir, 'panels', 'pipeline', 'module.js'),
  },
];

const ensureDir = (filePath) => fs.mkdirSync(path.dirname(filePath), { recursive: true });

const transformToAmd = (code) => {
  code = code.replace(/^\s*import\s+.*?;?\s*$/gm, '');
  code = code.replace(/import\s+\{[^}]*\}\s+from\s+['"]@grafana\/data['"];?/g, '');
  code = code.replace(/import\s+\{[^}]*\}\s+from\s+['"]@grafana\/runtime['"];?/g, '');
  code = code.replace(/import\s+\{[^}]*\}\s+from\s+['"]@grafana\/ui['"];?/g, '');

  code = code.replace(/import\s+React\s*,\s*\{([^}]+)\}\s+from\s+['"]react['"];?/g, (_, hooks) => {
    const hookNames = hooks.split(',').map((h) => h.trim()).join(', ');
    return `var React = __REACT__.default || __REACT__; var { ${hookNames} } = __REACT__;`;
  });
  code = code.replace(/import\s+(\w+)\s+from\s+['"]react['"];?/g, 'var $1 = __REACT__.default || __REACT__;');
  code = code.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]react['"];?/g, 'var $1 = __REACT__;');
  code = code.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]react-dom['"];?/g, 'var $1 = __REACT_DOM__;');
  code = code.replace(/import\s+[^;]+from\s+['"]react-dom['"];?/g, '');

  code = code.replace(/\bAppPlugin\b/g, '__GRAFANA_DATA__.AppPlugin');
  code = code.replace(/\bPanelPlugin\b/g, '__GRAFANA_DATA__.PanelPlugin');
  code = code.replace(/\bgetBackendSrv\d*\b/g, '__GRAFANA_RUNTIME__.getBackendSrv');
  code = code.replace(/\bgetDataSourceSrv\d*\b/g, '__GRAFANA_RUNTIME__.getDataSourceSrv');

  code = code.replace(/export\s+\{[^}]+\};?/g, '');
  code = code.replace(/export\s+const\s+(\w+)\s*=/g, 'var $1 =');
  code = code.replace(/export\s+function\s+(\w+)/g, 'function $1');
  code = code.replace(/export\s+default\s+/g, '');
  code = code.replace(/export\s+class\s+/g, 'class ');

  return `define(["@grafana/data","@grafana/runtime","@grafana/ui","react","react-dom"], function(__GRAFANA_DATA__, __GRAFANA_RUNTIME__, __GRAFANA_UI__, __REACT__, __REACT_DOM__) {
__REACT__ = (__REACT__ && __REACT__.__esModule && __REACT__.default) ? __REACT__.default : __REACT__;
__REACT_DOM__ = (__REACT_DOM__ && __REACT_DOM__.__esModule && __REACT_DOM__.default) ? __REACT_DOM__.default : __REACT_DOM__;
var React2 = __REACT__;
var ReactDOM2 = __REACT_DOM__;
var useState2 = React2.useState ? React2.useState.bind(React2) : void 0;
var useEffect2 = React2.useEffect ? React2.useEffect.bind(React2) : void 0;
var useMemo2 = React2.useMemo ? React2.useMemo.bind(React2) : void 0;
var useCallback2 = React2.useCallback ? React2.useCallback.bind(React2) : void 0;
${code}
  return { plugin: plugin };
});`;
};

const buildEntry = async ({ entry, outRelative, copyTarget, name }) => {
  const outPath = path.join(publicDir, outRelative);
  ensureDir(outPath);
  const tmpPath = `${outPath}.tmp`;

  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    sourcemap: true,
    outfile: tmpPath,
    loader: loaders,
    external: grafanaExternals,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });

  const code = fs.readFileSync(tmpPath, 'utf8');
  const wrapped = transformToAmd(code);
  fs.writeFileSync(outPath, wrapped);
  fs.unlinkSync(tmpPath);

  ensureDir(copyTarget);
  fs.copyFileSync(outPath, copyTarget);

  console.log(`✓ Built ${name} -> ${outPath}`);
  if (copyTarget !== outPath) {
    console.log(`  ↳ Copied to ${copyTarget}`);
  }
};

(async () => {
  try {
    fs.mkdirSync(publicDir, { recursive: true });
    for (const entry of entries) {
      await buildEntry(entry);
    }
    console.log('✓ Frontend build complete (AMD bundles ready)');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
