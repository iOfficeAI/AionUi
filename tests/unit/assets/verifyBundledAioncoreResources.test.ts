import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const {
  verifyBundledAioncoreResources,
} = require('../../../packages/shared-scripts/src/verify-bundled-aioncore-resources');

describe('verifyBundledAioncoreResources', () => {
  let tmp: string;
  let resourcesDir: string;
  let managedResourcesDir: string;
  let codexRoot: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'aionui-bundled-resources-'));
    resourcesDir = join(tmp, 'resources');
    managedResourcesDir = join(resourcesDir, 'bundled-aioncore', 'win32-x64', 'managed-resources');

    mkdirSync(join(resourcesDir, 'bundled-aioncore', 'win32-x64'), { recursive: true });
    writeFileSync(join(resourcesDir, 'bundled-aioncore', 'win32-x64', 'aioncore.exe'), '', { flush: true });
    writeFileSync(join(resourcesDir, 'bundled-aioncore', 'win32-x64', 'manifest.json'), '{}', { flush: true });

    const nodeRoot = join(managedResourcesDir, 'node', 'node-v24.11.0-win-x64');
    mkdirSync(nodeRoot, { recursive: true });
    writeFileSync(join(nodeRoot, 'node.exe'), '', { flush: true });

    codexRoot = join(managedResourcesDir, 'acp', 'codex-acp', '0.14.0', 'win32-x64');
    mkdirSync(codexRoot, { recursive: true });
    writeFileSync(join(codexRoot, 'manifest.json'), JSON.stringify({ entrypoint: 'codex-acp.exe', path_entries: [] }), {
      flush: true,
    });
    writeFileSync(join(codexRoot, 'codex-acp.exe'), '', { flush: true });

    const claudeRoot = join(managedResourcesDir, 'acp', 'claude-agent-acp', '0.13.0', 'win32-x64');
    mkdirSync(claudeRoot, { recursive: true });
    writeFileSync(
      join(claudeRoot, 'manifest.json'),
      JSON.stringify({ entrypoint: 'claude-agent-acp.exe', path_entries: [] }),
      { flush: true }
    );
    writeFileSync(join(claudeRoot, 'claude-agent-acp.exe'), '', { flush: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('passes when node and managed ACP entrypoints exist', () => {
    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.runtimeKey).toBe('win32-x64');
    expect(result.missing).toEqual([]);
  });

  it('reports missing managed node runtime executable', () => {
    rmSync(join(managedResourcesDir, 'node', 'node-v24.11.0-win-x64', 'node.exe'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain('bundled-aioncore/win32-x64/managed-resources/node/*/node.exe');
  });

  it('reports missing managed ACP manifest', () => {
    rmSync(join(codexRoot, 'manifest.json'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/acp/codex-acp/*/win32-x64/manifest.json'
    );
  });

  it('reports missing managed ACP entrypoint declared by manifest', () => {
    rmSync(join(codexRoot, 'codex-acp.exe'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/acp/codex-acp/0.14.0/win32-x64/codex-acp.exe'
    );
  });
});
