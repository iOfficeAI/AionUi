import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const {
  verifyBundledAioncoreResources,
} = require('../../../packages/shared-scripts/src/verify-bundled-aioncore-resources');

const CLAUDE_VERSION = '2.1.215';
const CODEX_VERSION = '0.144.6';

// codex ships under vendor/<triple>/... ; the triple is platform-specific.
const CODEX_TRIPLE: Record<string, string> = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-musl',
  'linux-arm64': 'aarch64-unknown-linux-musl',
};

function exeSuffix(runtimeKey: string) {
  return runtimeKey.startsWith('win32') ? '.exe' : '';
}

function claudeExecutable(runtimeKey: string) {
  return `claude${exeSuffix(runtimeKey)}`;
}

function codexExecutable(runtimeKey: string) {
  return `vendor/${CODEX_TRIPLE[runtimeKey]}/bin/codex${exeSuffix(runtimeKey)}`;
}

function codexVendorDir(runtimeKey: string) {
  return `vendor/${CODEX_TRIPLE[runtimeKey]}`;
}

function writeFile(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, '', { flush: true });
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flush: true });
}

// Materialize a CLI's on-disk layout: claude is a single binary at the root;
// codex is a vendor/<triple> subtree with the main binary + sidecars.
function createManagedCliFixture({
  managedResourcesDir,
  name,
  version,
  runtimeKey,
}: {
  managedResourcesDir: string;
  name: string;
  version: string;
  runtimeKey: string;
}) {
  const root = join(managedResourcesDir, 'cli', name, version, runtimeKey);
  if (name === 'claude') {
    writeFile(join(root, claudeExecutable(runtimeKey)));
  } else {
    const triple = CODEX_TRIPLE[runtimeKey];
    writeFile(join(root, 'vendor', triple, 'bin', `codex${exeSuffix(runtimeKey)}`));
    writeFile(join(root, 'vendor', triple, 'bin', `codex-code-mode-host${exeSuffix(runtimeKey)}`));
    writeFile(join(root, 'vendor', triple, 'codex-path', 'rg'));
  }
  return root;
}

function contractCli({ name, version, runtimeKey }: { name: string; version: string; runtimeKey: string }) {
  if (name === 'claude') {
    return {
      name,
      version,
      root: `cli/${name}/${version}/${runtimeKey}`,
      platformDirectory: runtimeKey,
      executable: claudeExecutable(runtimeKey),
      requiredFiles: [],
      requiredDirectories: [],
    };
  }
  return {
    name,
    version,
    root: `cli/${name}/${version}/${runtimeKey}`,
    platformDirectory: runtimeKey,
    executable: codexExecutable(runtimeKey),
    requiredFiles: [],
    requiredDirectories: [codexVendorDir(runtimeKey)],
  };
}

function writeManagedResourcesContract(
  managedResourcesDir: string,
  {
    runtimeKey = 'win32-x64',
    nodeRoot = 'node/node-v24.11.0-win-x64',
    nodeExecutable = 'node.exe',
  }: {
    runtimeKey?: string;
    nodeRoot?: string;
    nodeExecutable?: string;
  } = {}
) {
  writeJson(join(managedResourcesDir, 'manifest.json'), {
    schemaVersion: 2,
    runtimeKey,
    node: {
      version: '24.11.0',
      root: nodeRoot,
      executable: nodeExecutable,
    },
    clis: [
      contractCli({ name: 'claude', version: CLAUDE_VERSION, runtimeKey }),
      contractCli({ name: 'codex', version: CODEX_VERSION, runtimeKey }),
    ],
  });
}

function seedRuntimeKey(
  resourcesDir: string,
  {
    runtimeKey,
    platform,
    arch,
    nodeRoot,
    nodeExecutable,
  }: { runtimeKey: string; platform: string; arch: string; nodeRoot: string; nodeExecutable: string }
) {
  const managedResourcesDir = join(resourcesDir, 'bundled-aioncore', runtimeKey, 'managed-resources');
  mkdirSync(join(resourcesDir, 'bundled-aioncore', runtimeKey), { recursive: true });
  writeFile(join(resourcesDir, 'bundled-aioncore', runtimeKey, platform === 'win32' ? 'aioncore.exe' : 'aioncore'));
  writeJson(join(resourcesDir, 'bundled-aioncore', runtimeKey, 'manifest.json'), { platform, arch });
  writeFile(join(managedResourcesDir, ...nodeRoot.split('/'), ...nodeExecutable.split('/')));
  createManagedCliFixture({ managedResourcesDir, name: 'claude', version: CLAUDE_VERSION, runtimeKey });
  createManagedCliFixture({ managedResourcesDir, name: 'codex', version: CODEX_VERSION, runtimeKey });
  writeManagedResourcesContract(managedResourcesDir, { runtimeKey, nodeRoot, nodeExecutable });
  return managedResourcesDir;
}

describe('verifyBundledAioncoreResources', () => {
  let tmp: string;
  let resourcesDir: string;
  let managedResourcesDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'aionui-bundled-resources-'));
    resourcesDir = join(tmp, 'resources');
    managedResourcesDir = seedRuntimeKey(resourcesDir, {
      runtimeKey: 'win32-x64',
      platform: 'win32',
      arch: 'x64',
      nodeRoot: 'node/node-v24.11.0-win-x64',
      nodeExecutable: 'node.exe',
    });
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

  it('passes with the Windows arm64 CLI layout', () => {
    const arm64ResourcesDir = join(tmp, 'win32-arm64-resources');
    seedRuntimeKey(arm64ResourcesDir, {
      runtimeKey: 'win32-arm64',
      platform: 'win32',
      arch: 'arm64',
      nodeRoot: 'node/node-v24.11.0-win-arm64',
      nodeExecutable: 'node.exe',
    });

    const result = verifyBundledAioncoreResources({
      resourcesDir: arm64ResourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'arm64',
    });

    expect(result.missing).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(result.checked).toContain(
      'bundled-aioncore/win32-arm64/managed-resources/cli/codex/0.144.6/win32-arm64/vendor/aarch64-pc-windows-msvc/bin/codex.exe'
    );
  });

  it('passes for non-Windows node runtime layout', () => {
    const darwinResourcesDir = join(tmp, 'darwin-resources');
    seedRuntimeKey(darwinResourcesDir, {
      runtimeKey: 'darwin-arm64',
      platform: 'darwin',
      arch: 'arm64',
      nodeRoot: 'node/node-v24.11.0-darwin-arm64',
      nodeExecutable: 'bin/node',
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
    expect(result.checked).toContain(
      'bundled-aioncore/darwin-arm64/managed-resources/cli/claude/2.1.215/darwin-arm64/claude'
    );
  });

  it('reports missing non-Windows managed node runtime executable', () => {
    const linuxResourcesDir = join(tmp, 'linux-resources');
    const linuxManagedResourcesDir = seedRuntimeKey(linuxResourcesDir, {
      runtimeKey: 'linux-x64',
      platform: 'linux',
      arch: 'x64',
      nodeRoot: 'node/node-v24.11.0-linux-x64',
      nodeExecutable: 'bin/node',
    });
    // Remove the node executable, leaving the directory.
    rmSync(join(linuxManagedResourcesDir, 'node', 'node-v24.11.0-linux-x64', 'bin', 'node'), { force: true });

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

  it('fails when the pinned codex version directory is absent', () => {
    // The contract pins 0.144.6; only an older tree exists on disk.
    rmSync(join(managedResourcesDir, 'cli', 'codex', CODEX_VERSION), { recursive: true, force: true });
    createManagedCliFixture({ managedResourcesDir, name: 'codex', version: '0.100.0', runtimeKey: 'win32-x64' });

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/cli/codex/0.144.6/win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe'
    );
  });

  it('fails when the codex vendor sidecar directory is missing', () => {
    rmSync(join(managedResourcesDir, 'cli', 'codex', CODEX_VERSION, 'win32-x64', 'vendor'), {
      recursive: true,
      force: true,
    });

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        component: 'codex',
        reason: 'missing_directory',
      })
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

  it('ignores unknown contract fields but rejects duplicate cli names', () => {
    const manifestPath = join(managedResourcesDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.extraDiagnostic = { ignored: true };
    manifest.clis.push({ ...manifest.clis[0] });
    writeJson(manifestPath, manifest);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        component: 'claude',
        reason: 'duplicate_cli_name',
      })
    );
    expect(result.missing).toContain('bundled-aioncore/win32-x64/managed-resources/manifest.json<contract_failure>');
  });

  it('fails when a required CLI is missing from the contract', () => {
    const manifestPath = join(managedResourcesDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.clis = manifest.clis.filter((cli: { name: string }) => cli.name !== 'codex');
    writeJson(manifestPath, manifest);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.failures).toContainEqual(
      expect.objectContaining({
        component: 'codex',
        reason: 'missing_required_cli',
      })
    );
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
    manifest.schemaVersion = 1;
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

  it('fails when a cli platform directory does not match the runtime key', () => {
    const manifestPath = join(managedResourcesDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.clis[0].platformDirectory = 'linux-x64';
    writeJson(manifestPath, manifest);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.failures).toContainEqual(expect.objectContaining({ reason: 'runtime_key_mismatch' }));
  });
});
