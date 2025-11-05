const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const distDir = path.resolve(__dirname, '..', '..', '..', 'dist');
const publicDir = path.join(distDir, 'public');

// Create public directory
fs.mkdirSync(publicDir, { recursive: true });

// Build module.js for Grafana app plugin
// Use AMD format with external Grafana dependencies (as per official tutorial)
esbuild.build({
  entryPoints: [path.resolve(__dirname, '..', 'module.ts')],
  bundle: true,
  format: 'esm', // ES modules format
  platform: 'browser',
  sourcemap: true,
  outfile: path.join(publicDir, 'module.js.tmp'),
  loader: {
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
  },
  external: ['@grafana/data', '@grafana/runtime', '@grafana/ui', 'react', 'react-dom'],
  define: { 
    'process.env.NODE_ENV': '"production"'
  }
}).then(() => {
  // Convert ESM to AMD format that Grafana can load
  const tmpFile = path.join(publicDir, 'module.js.tmp');
  const outFile = path.join(publicDir, 'module.js');
  
  let code = fs.readFileSync(tmpFile, 'utf8');
  
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
  code = code.replace(/\bgetBackendSrv\b/g, '__GRAFANA_RUNTIME__.getBackendSrv');
  
  // Remove ALL export statements (AMD doesn't support them)
  code = code.replace(/export\s+\{([^}]+)\};?/g, ''); // export { plugin };
  code = code.replace(/export\s+const\s+(\w+)\s*=/g, 'var $1 ='); // export const plugin = ...
  code = code.replace(/export\s+function\s+(\w+)/g, 'function $1'); // export function ...
  code = code.replace(/export\s+default\s+/g, ''); // export default ...
  code = code.replace(/export\s+class\s+/g, 'class '); // export class ...
  
  // Wrap in simple AMD define() format
  const wrapped = `define(["@grafana/data","@grafana/runtime","@grafana/ui","react","react-dom"], function(__GRAFANA_DATA__, __GRAFANA_RUNTIME__, __GRAFANA_UI__, __REACT__, __REACT_DOM__) {
  ${code}
  return { plugin: plugin };
});`;
  
  fs.writeFileSync(outFile, wrapped);
  // Also copy to root dist for Grafana's plugin loader (Grafana looks for module.js in plugin root)
  fs.copyFileSync(outFile, path.join(distDir, 'module.js'));
  fs.unlinkSync(tmpFile);
  
  console.log('✓ Frontend build complete (module.js in SystemJS/AMD format)');
  console.log(`  - Created: ${outFile}`);
  console.log(`  - Copied to: ${path.join(distDir, 'module.js')}`);
}).catch((e) => { 
  console.error(e); 
  process.exit(1); 
});
