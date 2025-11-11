const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const distDir = path.resolve(__dirname, '..', '..', '..', 'dist');
const publicDir = path.join(distDir, 'public');

// Create public directory
fs.mkdirSync(publicDir, { recursive: true });

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
    tmp: path.join(publicDir, 'module.js.tmp'),
    out: path.join(publicDir, 'module.js'),
    copyTargets: [path.join(distDir, 'module.js')],
  },
  {
    name: 'pipeline-panel',
    entry: path.resolve(__dirname, '..', 'panels', 'pipeline', 'module.tsx'),
    tmp: path.join(publicDir, 'panels', 'pipeline', 'module.js.tmp'),
    out: path.join(publicDir, 'panels', 'pipeline', 'module.js'),
    copyTargets: [path.join(distDir, 'panels', 'pipeline', 'module.js')],
  },
];

const ensureDir = (filePath) => fs.mkdirSync(path.dirname(filePath), { recursive: true });

const esmToAmd = (code) => {
  // Replace ALL ESM imports with AMD parameters
  // Handle various import patterns:
  // - import { X } from '@grafana/data'
  // - import X, { Y } from 'react'
  // - import * as X from 'react'
  
  // Remove Grafana imports (they'll come from AMD params)
  code = code.replace(/import\s+\{[^}]*\}\s+from\s+['"]@grafana\/data['"];?/g, '');
  code = code.replace(/import\s+\{[^}]*\}\s+from\s+['"]@grafana\/runtime['"];?/g, '');
  code = code.replace(/import\s+\{[^}]*\}\s+from\s+['"]@grafana\/ui['"];?/g, '');
  
  // Handle React imports: import React, { useEffect, useState } from "react"
  // Grafana's React module might export React directly or as default
  code = code.replace(/import\s+React\s*,\s*\{([^}]+)\}\s+from\s+['"]react['"];?/g, 
    (match, hooks) => {
      const hookNames = hooks.split(',').map(h => h.trim()).join(', ');
      // Try both __REACT__ directly and __REACT__.default
      return `var React = __REACT__.default || __REACT__; var { ${hookNames} } = __REACT__;`;
    });
  
  // Handle default React import only: import React from "react"
  code = code.replace(/import\s+(\w+)\s+from\s+['"]react['"];?/g, 'var $1 = __REACT__.default || __REACT__;');
  
  // Handle namespace imports: import * as X from "react"
  code = code.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]react['"];?/g, 'var $1 = __REACT__;');
  code = code.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]react-dom['"];?/g, 'var $1 = __REACT_DOM__;');
  
  // Remove any remaining react-dom imports
  code = code.replace(/import\s+[^;]+from\s+['"]react-dom['"];?/g, '');
  
  // Replace API calls with AMD params
  code = code.replace(/\bAppPlugin\b/g, '__GRAFANA_DATA__.AppPlugin');
  code = code.replace(/\bPanelPlugin\b/g, '__GRAFANA_DATA__.PanelPlugin');
  code = code.replace(/\bgetBackendSrv\b/g, '__GRAFANA_RUNTIME__.getBackendSrv');
  
  // Remove ALL export statements (AMD doesn't support them)
  code = code.replace(/export\s+\{([^}]+)\};?/g, ''); // export { plugin };
  code = code.replace(/export\s+const\s+(\w+)\s*=/g, 'var $1 ='); // export const plugin = ...
  code = code.replace(/export\s+function\s+(\w+)/g, 'function $1'); // export function ...
  code = code.replace(/export\s+default\s+/g, ''); // export default ...
  code = code.replace(/export\s+class\s+/g, 'class '); // export class ...
  return `define(["@grafana/data","@grafana/runtime","@grafana/ui","react","react-dom"], function(__GRAFANA_DATA__, __GRAFANA_RUNTIME__, __GRAFANA_UI__, __REACT__, __REACT_DOM__) {
${code}
  return { plugin: plugin };
});`;
};

const buildEntry = async ({ entry, tmp, out, copyTargets, name }) => {
  ensureDir(tmp);
  ensureDir(out);
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    sourcemap: true,
    outfile: tmp,
    loader: loaders,
    external: grafanaExternals,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });

  let code = fs.readFileSync(tmp, 'utf8');
  const wrapped = esmToAmd(code);

  fs.writeFileSync(out, wrapped);
  fs.unlinkSync(tmp);

  if (Array.isArray(copyTargets)) {
    for (const target of copyTargets) {
      ensureDir(target);
      fs.copyFileSync(out, target);
    }
  }
  console.log(`✓ Built ${name} -> ${out}`);
};

(async () => {
  try {
    for (const entry of entries) {
      await buildEntry(entry);
    }
    console.log('✓ Frontend build complete (AMD modules ready)');
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
