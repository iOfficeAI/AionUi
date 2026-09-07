#!/usr/bin/env node
/**
 * Build builtin MCP server scripts as fully self-contained CJS bundles.
 *
 * electron-vite's externalizeDepsPlugin leaves all npm packages as require()
 * calls, which works for Electron's main process (ASAR virtual FS patches
 * require()) but fails when an external `node` process runs the script from
 * app.asar.unpacked — there is no ASAR support there.
 *
 * This script uses esbuild's programmatic API (instead of CLI flags) to avoid
 * shell-quoting issues with special characters in --define values.
 */

const { inputHash, outputsMatch, saveOutputs } = require('../packages/shared-scripts/src/build-cache');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SHARED_OPTIONS = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  tsconfig: path.join(ROOT, 'tsconfig.json'),
  loader: { '.wasm': 'empty' },
};

async function main({ root = ROOT, esbuild = require('esbuild'), force = process.argv.includes('--force') } = {}) {
  const outputs = ['image-gen', 'browser', 'lark-cli'].map((name) =>
    path.join(root, `out/main/builtin-mcp-${name}.js`)
  );
  const manifest = path.join(root, 'out/.mcp-build-cache.json');
  const key = inputHash(
    root,
    [
      'packages',
      'scripts/build-mcp-servers.js',
      'packages/shared-scripts/src/build-cache.js',
      'package.json',
      'bun.lock',
      'package-lock.json',
      'tsconfig.json',
      'patches',
    ],
    { schema: 1, node: process.version, esbuild: esbuild.version }
  );
  if (!force && outputsMatch(manifest, key, outputs)) {
    console.log('[mcp-cache] hit: inputs and outputs verified');
    return { cached: true };
  }
  console.log('[mcp-cache] miss: forced, changed inputs, or missing/corrupt outputs');
  await Promise.all(
    ['imageGenServer', 'browserServer', 'larkCliServer'].map((name, index) =>
      esbuild.build({
        ...SHARED_OPTIONS,
        tsconfig: path.join(root, 'tsconfig.json'),
        entryPoints: [path.join(root, `packages/desktop/src/process/resources/builtinMcp/${name}.ts`)],
        outfile: outputs[index],
      })
    )
  );
  saveOutputs(manifest, key, outputs);
  return { cached: false };
}

if (require.main === module) {
  main().catch((err) => {
    console.error('MCP server build failed:', err);
    process.exit(1);
  });
}

module.exports = { main };
