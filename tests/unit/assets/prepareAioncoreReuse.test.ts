/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../..');

describe('prepareAioncore reuse guard', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'aionui-prepare-aioncore-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('repairs an existing matching bundle when managed resources are missing', () => {
    const projectRoot = join(tmp, 'project');
    const runtimeDir = join(projectRoot, 'resources', 'bundled-aioncore', 'darwin-arm64');
    const hookPath = join(tmp, 'hook.cjs');
    const scriptPath = join(tmp, 'run.cjs');

    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(join(runtimeDir, 'aioncore'), '', { flush: true });
    chmodSync(join(runtimeDir, 'aioncore'), 0o755);
    writeFileSync(
      join(runtimeDir, 'manifest.json'),
      JSON.stringify({ platform: 'darwin', arch: 'arm64', version: 'v-test', sourceType: 'existing' }),
      { flush: true }
    );

    writeFileSync(
      hookPath,
      `
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const originalExecFileSync = childProcess.execFileSync;
childProcess.execFileSync = function patchedExecFileSync(file, args, options) {
  if (Array.isArray(args) && args.includes('prepare-managed-resources')) {
    const bundleOut = args[args.indexOf('--bundle-out') + 1];
    fs.mkdirSync(path.join(bundleOut, 'node', 'node-v-test-darwin-arm64', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(bundleOut, 'node', 'node-v-test-darwin-arm64', 'bin', 'node'), '');

    for (const [toolId, entrypoint] of [
      ['codex-acp', 'codex-acp'],
      ['claude-agent-acp', 'claude-agent-acp'],
    ]) {
      const root = path.join(bundleOut, 'acp', toolId, '0.0.0', 'darwin-arm64');
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ entrypoint }));
      fs.writeFileSync(path.join(root, entrypoint), '');
    }
    return Buffer.from('');
  }

  return originalExecFileSync.call(this, file, args, options);
};
`,
      'utf8'
    );

    writeFileSync(
      scriptPath,
      `
const path = require('node:path');
const { prepareAioncore } = require(path.join(${JSON.stringify(repoRoot)}, 'packages/shared-scripts/src/prepare-aioncore.js'));
const { verifyBundledAioncoreResources } = require(path.join(${JSON.stringify(
        repoRoot
      )}, 'packages/shared-scripts/src/verify-bundled-aioncore-resources.js'));

const projectRoot = ${JSON.stringify(projectRoot)};
prepareAioncore({ projectRoot, platform: 'darwin', arch: 'arm64', version: 'v-test' });
const result = verifyBundledAioncoreResources({
  resourcesDir: path.join(projectRoot, 'resources'),
  electronPlatformName: 'darwin',
  targetArch: 'arm64',
});
if (result.missing.length > 0) {
  throw new Error('missing after repair: ' + result.missing.join(', '));
}
`,
      'utf8'
    );

    const result = spawnSync(process.execPath, ['--require', hookPath, scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain('Repaired bundled managed resources');
  });
});
