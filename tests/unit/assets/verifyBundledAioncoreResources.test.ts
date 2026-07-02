import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const {
  verifyBundledAioncoreResources,
} = require('../../../packages/shared-scripts/src/verify-bundled-aioncore-resources');

function writeFile(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, '', { flush: true });
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value), { flush: true });
}

function createManagedAcpToolFixture({
  managedResourcesDir,
  toolId,
  version,
  runtimeKey,
  entrypoint,
  platformExecutableParts = [],
}: {
  managedResourcesDir: string;
  toolId: string;
  version: string;
  runtimeKey: string;
  entrypoint: string;
  platformExecutableParts?: string[];
}) {
  const platformRoot = join(managedResourcesDir, 'acp', toolId, version, runtimeKey);

  writeJson(join(platformRoot, 'manifest.json'), { entrypoint, path_entries: [] });
  writeFile(join(platformRoot, entrypoint));
  writeJson(join(platformRoot, 'package.json'), {});
  writeJson(join(platformRoot, 'package-lock.json'), {});
  mkdirSync(join(platformRoot, 'node_modules'), { recursive: true });

  if (platformExecutableParts.length > 0) {
    writeFile(join(platformRoot, ...platformExecutableParts));
  }

  return platformRoot;
}

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
    writeFile(join(resourcesDir, 'bundled-aioncore', 'win32-x64', 'aioncore.exe'));
    writeJson(join(resourcesDir, 'bundled-aioncore', 'win32-x64', 'manifest.json'), {
      platform: 'win32',
      arch: 'x64',
    });

    const nodeRoot = join(managedResourcesDir, 'node', 'node-v24.11.0-win-x64');
    mkdirSync(nodeRoot, { recursive: true });
    writeFile(join(nodeRoot, 'node.exe'));

    codexRoot = createManagedAcpToolFixture({
      managedResourcesDir,
      toolId: 'codex-acp',
      version: '0.14.0',
      runtimeKey: 'win32-x64',
      entrypoint: 'node_modules/@zed-industries/codex-acp-win32-x64/bin/codex-acp.exe',
      platformExecutableParts: ['node_modules', '@zed-industries', 'codex-acp-win32-x64', 'bin', 'codex-acp.exe'],
    });

    createManagedAcpToolFixture({
      managedResourcesDir,
      toolId: 'claude-agent-acp',
      version: '0.13.0',
      runtimeKey: 'win32-x64',
      entrypoint: 'node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe',
      platformExecutableParts: ['node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-x64', 'claude.exe'],
    });
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

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/node/node-v24.11.0-win-x64/node.exe'
    );
  });

  it('reports bundle manifest platform and architecture mismatches', () => {
    writeJson(join(resourcesDir, 'bundled-aioncore', 'win32-x64', 'manifest.json'), {
      platform: 'darwin',
      arch: 'arm64',
    });

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain('bundled-aioncore/win32-x64/manifest.json<platform:win32>');
    expect(result.missing).toContain('bundled-aioncore/win32-x64/manifest.json<arch:x64>');
  });

  it('passes for non-Windows node runtime layout', () => {
    const darwinResourcesDir = join(tmp, 'darwin-resources');
    const darwinManagedResourcesDir = join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64', 'managed-resources');

    mkdirSync(join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64'), { recursive: true });
    writeFile(join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64', 'aioncore'));
    writeJson(join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64', 'manifest.json'), {
      platform: 'darwin',
      arch: 'arm64',
    });
    mkdirSync(join(darwinManagedResourcesDir, 'node', 'node-v24.11.0-darwin-arm64', 'bin'), { recursive: true });
    writeFile(join(darwinManagedResourcesDir, 'node', 'node-v24.11.0-darwin-arm64', 'bin', 'node'));

    createManagedAcpToolFixture({
      managedResourcesDir: darwinManagedResourcesDir,
      toolId: 'codex-acp',
      version: '0.14.0',
      runtimeKey: 'darwin-arm64',
      entrypoint: 'codex-acp',
    });

    createManagedAcpToolFixture({
      managedResourcesDir: darwinManagedResourcesDir,
      toolId: 'claude-agent-acp',
      version: '0.13.0',
      runtimeKey: 'darwin-arm64',
      entrypoint: 'claude-agent-acp',
    });

    const result = verifyBundledAioncoreResources({
      resourcesDir: darwinResourcesDir,
      electronPlatformName: 'darwin',
      targetArch: 'arm64',
    });

    expect(result.missing).toEqual([]);
    expect(result.checked).toContain(
      'bundled-aioncore/darwin-arm64/managed-resources/node/node-v24.11.0-darwin-arm64/bin/node'
    );
  });

  it('reports missing non-Windows managed node runtime executable', () => {
    const linuxResourcesDir = join(tmp, 'linux-resources');
    const linuxManagedResourcesDir = join(linuxResourcesDir, 'bundled-aioncore', 'linux-x64', 'managed-resources');

    mkdirSync(join(linuxResourcesDir, 'bundled-aioncore', 'linux-x64'), { recursive: true });
    writeFile(join(linuxResourcesDir, 'bundled-aioncore', 'linux-x64', 'aioncore'));
    writeJson(join(linuxResourcesDir, 'bundled-aioncore', 'linux-x64', 'manifest.json'), {
      platform: 'linux',
      arch: 'x64',
    });
    mkdirSync(join(linuxManagedResourcesDir, 'node', 'node-v24.11.0-linux-x64'), { recursive: true });

    const result = verifyBundledAioncoreResources({
      resourcesDir: linuxResourcesDir,
      electronPlatformName: 'linux',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/linux-x64/managed-resources/node/node-v24.11.0-linux-x64/bin/node'
    );
  });

  it('reports missing managed ACP manifest', () => {
    rmSync(join(codexRoot, 'manifest.json'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/acp/codex-acp/0.14.0/win32-x64/manifest.json'
    );
  });

  it('reports missing managed ACP entrypoint declared by manifest', () => {
    rmSync(join(codexRoot, 'node_modules', '@zed-industries', 'codex-acp-win32-x64', 'bin', 'codex-acp.exe'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/acp/codex-acp/0.14.0/win32-x64/node_modules/@zed-industries/codex-acp-win32-x64/bin/codex-acp.exe'
    );
  });
});
