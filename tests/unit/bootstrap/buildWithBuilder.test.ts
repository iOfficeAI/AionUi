/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../..');

describe('build-with-builder', () => {
  it.each([
    {
      args: ['arm64', '--win', '--arm64'],
      expectedArch: 'arm64',
    },
    {
      args: ['auto', '--mac', '--x64'],
      expectedArch: 'x64',
    },
  ])('prepares bundled AionCore for $expectedArch with args $args', ({ args, expectedArch }) => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aionui-build-test-'));
    const hookPath = join(tempDir, 'hook.cjs');
    const callsPath = join(tempDir, 'prepare-calls.json');

    writeFileSync(
      hookPath,
      `
const childProcess = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const originalLoad = Module._load;

function recordPrepareCall(options) {
  const callsPath = process.env.AIONUI_PREPARE_CALLS_FILE;
  const calls = fs.existsSync(callsPath) ? JSON.parse(fs.readFileSync(callsPath, 'utf8')) : [];
  calls.push(options ?? null);
  fs.writeFileSync(callsPath, JSON.stringify(calls));
  return { prepared: true, dir: 'mock-bundled-aioncore', sourceType: 'mock' };
}

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './prepareAioncore' || request.endsWith('/prepareAioncore')) {
    return recordPrepareCall;
  }

  if (request.endsWith('packages/shared-scripts/src/prepare-aioncore.js')) {
    return { prepareAioncore: recordPrepareCall };
  }

  if (request === './resolveAioncoreVersion.js' || request.endsWith('/resolveAioncoreVersion.js')) {
    return { resolveAioncoreVersion: () => 'v-test' };
  }

  return originalLoad.call(this, request, parent, isMain);
};

childProcess.execSync = function mockedExecSync(command) {
  const commandText = String(command);
  if (commandText.includes('electron-vite build')) {
    fs.mkdirSync(path.join(process.cwd(), 'out/main'), { recursive: true });
    fs.mkdirSync(path.join(process.cwd(), 'out/renderer'), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), 'out/main/index.js'), '');
    fs.writeFileSync(path.join(process.cwd(), 'out/renderer/index.html'), '');
  }
  return Buffer.from('');
};
`,
      'utf8'
    );

    try {
      const result = spawnSync(process.execPath, ['scripts/build-with-builder.js', ...args], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          AIONUI_PREPARE_CALLS_FILE: callsPath,
          NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${hookPath}`].filter(Boolean).join(' '),
        },
      });

      expect(result.status, result.stderr || result.stdout).toBe(0);

      const calls = JSON.parse(readFileSync(callsPath, 'utf8')) as Array<{ arch?: string } | null>;
      expect(calls).toContainEqual(expect.objectContaining({ arch: expectedArch }));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
