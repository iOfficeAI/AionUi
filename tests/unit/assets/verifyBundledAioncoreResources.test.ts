import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const {
  verifyBundledAioncoreResources,
} = require('../../../packages/shared-scripts/src/verify-bundled-aioncore-resources');

const CODEX_ENTRYPOINT = 'node_modules/@agentclientprotocol/codex-acp/dist/index.js';
const CLAUDE_ENTRYPOINT = 'node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js';
const CODEX_WIN32_X64_EXECUTABLE = 'node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe';
const CLAUDE_WIN32_X64_EXECUTABLE = 'node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe';
const CODEX_WIN32_ARM64_EXECUTABLE =
  'node_modules/@openai/codex-win32-arm64/vendor/aarch64-pc-windows-msvc/bin/codex.exe';
const CLAUDE_WIN32_ARM64_EXECUTABLE = 'node_modules/@anthropic-ai/claude-agent-sdk-win32-arm64/claude.exe';
const CODEX_UNIX_EXECUTABLE = 'node_modules/.bin/codex-acp';
const CLAUDE_UNIX_EXECUTABLE = 'node_modules/.bin/claude-agent-acp';

function writeFile(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, '', { flush: true });
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flush: true });
}

function createManagedAcpToolFixture({
  managedResourcesDir,
  toolId,
  version,
  runtimeKey,
  entrypoint,
  platformExecutable,
}: {
  managedResourcesDir: string;
  toolId: string;
  version: string;
  runtimeKey: string;
  entrypoint: string;
  platformExecutable: string;
}) {
  const platformRoot = join(managedResourcesDir, 'acp', toolId, version, runtimeKey);

  writeJson(join(platformRoot, 'manifest.json'), { entrypoint, path_entries: ['node_modules/.bin'] });
  writeFile(join(platformRoot, entrypoint));
  writeJson(join(platformRoot, 'package.json'), {});
  writeJson(join(platformRoot, 'package-lock.json'), {});
  mkdirSync(join(platformRoot, 'node_modules'), { recursive: true });
  mkdirSync(join(platformRoot, 'node_modules', '.bin'), { recursive: true });
  writeFile(join(platformRoot, platformExecutable));

  return platformRoot;
}

function contractTool({
  slug,
  version,
  packageName,
  runtimeKey,
  entrypoint,
  platformExecutable,
}: {
  slug: string;
  version: string;
  packageName: string;
  runtimeKey: string;
  entrypoint: string;
  platformExecutable: string;
}) {
  return {
    slug,
    version,
    packageName,
    root: `acp/${slug}/${version}/${runtimeKey}`,
    platformDirectory: runtimeKey,
    manifest: 'manifest.json',
    entrypoint,
    pathEntries: ['node_modules/.bin'],
    requiredFiles: ['package.json', 'package-lock.json'],
    requiredDirectories: ['node_modules'],
    platformExecutable,
  };
}

function writeManagedResourcesContract(
  managedResourcesDir: string,
  {
    runtimeKey = 'win32-x64',
    nodeRoot = 'node/node-v24.11.0-win-x64',
    nodeExecutable = 'node.exe',
    codexPlatformExecutable = CODEX_WIN32_X64_EXECUTABLE,
    claudePlatformExecutable = CLAUDE_WIN32_X64_EXECUTABLE,
  }: {
    runtimeKey?: string;
    nodeRoot?: string;
    nodeExecutable?: string;
    codexPlatformExecutable?: string;
    claudePlatformExecutable?: string;
  } = {}
) {
  writeJson(join(managedResourcesDir, 'manifest.json'), {
    schemaVersion: 1,
    runtimeKey,
    node: {
      version: '24.11.0',
      root: nodeRoot,
      executable: nodeExecutable,
    },
    acpTools: [
      contractTool({
        slug: 'codex-acp',
        version: '1.1.2',
        packageName: '@agentclientprotocol/codex-acp',
        runtimeKey,
        entrypoint: CODEX_ENTRYPOINT,
        platformExecutable: codexPlatformExecutable,
      }),
      contractTool({
        slug: 'claude-agent-acp',
        version: '0.58.1',
        packageName: '@agentclientprotocol/claude-agent-acp',
        runtimeKey,
        entrypoint: CLAUDE_ENTRYPOINT,
        platformExecutable: claudePlatformExecutable,
      }),
    ],
  });
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

    writeFile(join(managedResourcesDir, 'node', 'node-v24.11.0-win-x64', 'node.exe'));
    codexRoot = createManagedAcpToolFixture({
      managedResourcesDir,
      toolId: 'codex-acp',
      version: '1.1.2',
      runtimeKey: 'win32-x64',
      entrypoint: CODEX_ENTRYPOINT,
      platformExecutable: CODEX_WIN32_X64_EXECUTABLE,
    });
    createManagedAcpToolFixture({
      managedResourcesDir,
      toolId: 'claude-agent-acp',
      version: '0.58.1',
      runtimeKey: 'win32-x64',
      entrypoint: CLAUDE_ENTRYPOINT,
      platformExecutable: CLAUDE_WIN32_X64_EXECUTABLE,
    });
    writeManagedResourcesContract(managedResourcesDir);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('passes when the managed resources contract points to existing resources', () => {
    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.runtimeKey).toBe('win32-x64');
    expect(result.missing).toEqual([]);
    expect(result.failures).toEqual([]);
  });

  it('fails when managed resources contract is missing', () => {
    rmSync(join(managedResourcesDir, 'manifest.json'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain('bundled-aioncore/win32-x64/managed-resources/manifest.json');
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        component: 'managed-resources',
        reason: 'missing_file',
      })
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
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        component: 'bundle-manifest',
        reason: 'runtime_key_mismatch',
      })
    );
  });

  it('passes with the managed Codex ACP Windows arm64 platform executable', () => {
    const arm64ResourcesDir = join(tmp, 'win32-arm64-resources');
    const arm64ManagedResourcesDir = join(arm64ResourcesDir, 'bundled-aioncore', 'win32-arm64', 'managed-resources');

    mkdirSync(join(arm64ResourcesDir, 'bundled-aioncore', 'win32-arm64'), { recursive: true });
    writeFile(join(arm64ResourcesDir, 'bundled-aioncore', 'win32-arm64', 'aioncore.exe'));
    writeJson(join(arm64ResourcesDir, 'bundled-aioncore', 'win32-arm64', 'manifest.json'), {
      platform: 'win32',
      arch: 'arm64',
    });
    writeFile(join(arm64ManagedResourcesDir, 'node', 'node-v24.11.0-win-arm64', 'node.exe'));
    createManagedAcpToolFixture({
      managedResourcesDir: arm64ManagedResourcesDir,
      toolId: 'codex-acp',
      version: '1.1.2',
      runtimeKey: 'win32-arm64',
      entrypoint: CODEX_ENTRYPOINT,
      platformExecutable: CODEX_WIN32_ARM64_EXECUTABLE,
    });
    createManagedAcpToolFixture({
      managedResourcesDir: arm64ManagedResourcesDir,
      toolId: 'claude-agent-acp',
      version: '0.58.1',
      runtimeKey: 'win32-arm64',
      entrypoint: CLAUDE_ENTRYPOINT,
      platformExecutable: CLAUDE_WIN32_ARM64_EXECUTABLE,
    });
    writeManagedResourcesContract(arm64ManagedResourcesDir, {
      runtimeKey: 'win32-arm64',
      nodeRoot: 'node/node-v24.11.0-win-arm64',
      nodeExecutable: 'node.exe',
      codexPlatformExecutable: CODEX_WIN32_ARM64_EXECUTABLE,
      claudePlatformExecutable: CLAUDE_WIN32_ARM64_EXECUTABLE,
    });

    const result = verifyBundledAioncoreResources({
      resourcesDir: arm64ResourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'arm64',
    });

    expect(result.missing).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(result.checked).toContain(
      'bundled-aioncore/win32-arm64/managed-resources/acp/codex-acp/1.1.2/win32-arm64/node_modules/@openai/codex-win32-arm64/vendor/aarch64-pc-windows-msvc/bin/codex.exe'
    );
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
    writeFile(join(darwinManagedResourcesDir, 'node', 'node-v24.11.0-darwin-arm64', 'bin', 'node'));
    createManagedAcpToolFixture({
      managedResourcesDir: darwinManagedResourcesDir,
      toolId: 'codex-acp',
      version: '1.1.2',
      runtimeKey: 'darwin-arm64',
      entrypoint: CODEX_ENTRYPOINT,
      platformExecutable: CODEX_UNIX_EXECUTABLE,
    });
    createManagedAcpToolFixture({
      managedResourcesDir: darwinManagedResourcesDir,
      toolId: 'claude-agent-acp',
      version: '0.58.1',
      runtimeKey: 'darwin-arm64',
      entrypoint: CLAUDE_ENTRYPOINT,
      platformExecutable: CLAUDE_UNIX_EXECUTABLE,
    });
    writeManagedResourcesContract(darwinManagedResourcesDir, {
      runtimeKey: 'darwin-arm64',
      nodeRoot: 'node/node-v24.11.0-darwin-arm64',
      nodeExecutable: 'bin/node',
      codexPlatformExecutable: CODEX_UNIX_EXECUTABLE,
      claudePlatformExecutable: CLAUDE_UNIX_EXECUTABLE,
    });

    const result = verifyBundledAioncoreResources({
      resourcesDir: darwinResourcesDir,
      electronPlatformName: 'darwin',
      targetArch: 'arm64',
    });

    expect(result.missing).toEqual([]);
    expect(result.failures).toEqual([]);
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
    createManagedAcpToolFixture({
      managedResourcesDir: linuxManagedResourcesDir,
      toolId: 'codex-acp',
      version: '1.1.2',
      runtimeKey: 'linux-x64',
      entrypoint: CODEX_ENTRYPOINT,
      platformExecutable: CODEX_UNIX_EXECUTABLE,
    });
    createManagedAcpToolFixture({
      managedResourcesDir: linuxManagedResourcesDir,
      toolId: 'claude-agent-acp',
      version: '0.58.1',
      runtimeKey: 'linux-x64',
      entrypoint: CLAUDE_ENTRYPOINT,
      platformExecutable: CLAUDE_UNIX_EXECUTABLE,
    });
    writeManagedResourcesContract(linuxManagedResourcesDir, {
      runtimeKey: 'linux-x64',
      nodeRoot: 'node/node-v24.11.0-linux-x64',
      nodeExecutable: 'bin/node',
      codexPlatformExecutable: CODEX_UNIX_EXECUTABLE,
      claudePlatformExecutable: CLAUDE_UNIX_EXECUTABLE,
    });

    const result = verifyBundledAioncoreResources({
      resourcesDir: linuxResourcesDir,
      electronPlatformName: 'linux',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/linux-x64/managed-resources/node/node-v24.11.0-linux-x64/bin/node'
    );
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        component: 'managed-node',
        reason: 'missing_file',
      })
    );
  });

  it('fails when only an old Codex ACP version exists even if it is structurally complete', () => {
    rmSync(join(managedResourcesDir, 'acp', 'codex-acp', '1.1.2'), { recursive: true, force: true });
    createManagedAcpToolFixture({
      managedResourcesDir,
      toolId: 'codex-acp',
      version: '0.16.0',
      runtimeKey: 'win32-x64',
      entrypoint: CODEX_ENTRYPOINT,
      platformExecutable: CODEX_WIN32_X64_EXECUTABLE,
    });

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/acp/codex-acp/1.1.2/win32-x64/manifest.json'
    );
  });

  it('fails when contract node root points to the required version but only a wrong node directory exists', () => {
    rmSync(join(managedResourcesDir, 'node', 'node-v24.11.0-win-x64'), { recursive: true, force: true });
    writeFile(join(managedResourcesDir, 'node', 'node-v20.0.0-win-x64', 'node.exe'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/node/node-v24.11.0-win-x64/node.exe'
    );
  });

  it('ignores unknown contract fields but rejects duplicate tool slugs', () => {
    const manifestPath = join(managedResourcesDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.extraDiagnostic = { ignored: true };
    manifest.acpTools.push({ ...manifest.acpTools[0] });
    writeJson(manifestPath, manifest);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        component: 'codex-acp',
        reason: 'duplicate_tool_slug',
      })
    );
    expect(result.missing).toContain('bundled-aioncore/win32-x64/managed-resources/manifest.json<contract_failure>');
  });

  it('fails when the contract is invalid JSON', () => {
    writeFileSync(join(managedResourcesDir, 'manifest.json'), '{');

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.failures).toContainEqual(expect.objectContaining({ reason: 'invalid_json' }));
  });

  it('fails when the contract schema version is unsupported', () => {
    const manifestPath = join(managedResourcesDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.schemaVersion = 2;
    writeJson(manifestPath, manifest);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.failures).toContainEqual(expect.objectContaining({ reason: 'unsupported_schema_version' }));
  });

  it('fails when required contract fields have invalid types', () => {
    const manifestPath = join(managedResourcesDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.node.root = 42;
    writeJson(manifestPath, manifest);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.failures).toContainEqual(expect.objectContaining({ reason: 'invalid_schema' }));
  });

  it('fails when a tool platform directory does not match the runtime key', () => {
    const manifestPath = join(managedResourcesDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.acpTools[0].platformDirectory = 'linux-x64';
    writeJson(manifestPath, manifest);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.failures).toContainEqual(expect.objectContaining({ reason: 'runtime_key_mismatch' }));
  });

  it('fails when a local tool manifest entrypoint disagrees with the contract', () => {
    writeJson(join(codexRoot, 'manifest.json'), {
      entrypoint: 'node_modules/@agentclientprotocol/codex-acp/dist/other.js',
      path_entries: ['node_modules/.bin'],
    });

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        component: 'codex-acp',
        reason: 'manifest_entrypoint_mismatch',
      })
    );
  });
});
