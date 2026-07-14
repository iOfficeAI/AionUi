import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptPath = 'resources/windows/support/verify-bundled-aioncore-install.ps1';
const script = readFileSync(scriptPath, 'utf8');

function writeFile(filePath: string, contents = '') {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function writeJson(filePath: string, value: unknown) {
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

describe('Windows bundled aioncore install verifier', () => {
  it('reads managed resources manifest instead of deriving Codex platform paths', () => {
    expect(script).toContain("Join-Path $managedRoot 'manifest.json'");
    expect(script).toContain('schemaVersion');
    expect(script).toContain('platformExecutable');
    expect(script).not.toContain('Get-CodexPlatformExecutable');
    expect(script).not.toContain('x86_64-pc-windows-msvc');
  });

  it('logs machine-readable contract failures', () => {
    expect(script).toContain('duplicate_tool_slug');
    expect(script).toContain('missing_required_tool');
    expect(script).toContain('unsupported_schema_version');
    expect(script).toContain('invalid_schema');
    expect(script).toContain('result=fail runtime=$RuntimeKey failures=$summary');
  });

  it('requires numeric schemaVersion without PowerShell string coercion', () => {
    expect(script).toContain("Test-NumberField $contract 'schemaVersion'");
    expect(script).not.toContain('if ($contract.schemaVersion -ne 1)');
  });

  const runOnWindows = process.platform === 'win32' ? it : it.skip;

  runOnWindows('fails an old-version-only Codex ACP install directory', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-install-verify-'));
    const installDir = join(tmp, 'install');
    const managedRoot = join(installDir, 'resources', 'bundled-aioncore', 'win32-x64', 'managed-resources');
    const logPath = join(tmp, 'verify.log');

    try {
      writeFile(join(installDir, 'resources', 'bundled-aioncore', 'win32-x64', 'aioncore.exe'), 'x');
      writeJson(join(installDir, 'resources', 'bundled-aioncore', 'win32-x64', 'manifest.json'), {
        platform: 'win32',
        arch: 'x64',
      });
      writeFile(join(managedRoot, 'node', 'node-v24.11.0-win-x64', 'node.exe'), 'x');
      writeJson(join(managedRoot, 'manifest.json'), {
        schemaVersion: 1,
        runtimeKey: 'win32-x64',
        node: {
          version: '24.11.0',
          root: 'node/node-v24.11.0-win-x64',
          executable: 'node.exe',
        },
        acpTools: [
          {
            slug: 'codex-acp',
            version: '1.1.2',
            packageName: '@agentclientprotocol/codex-acp',
            root: 'acp/codex-acp/1.1.2/win32-x64',
            platformDirectory: 'win32-x64',
            manifest: 'manifest.json',
            entrypoint: 'node_modules/@agentclientprotocol/codex-acp/dist/index.js',
            pathEntries: ['node_modules/.bin'],
            requiredFiles: ['package.json', 'package-lock.json'],
            requiredDirectories: ['node_modules'],
            platformExecutable: 'node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe',
          },
          {
            slug: 'claude-agent-acp',
            version: '0.58.1',
            packageName: '@agentclientprotocol/claude-agent-acp',
            root: 'acp/claude-agent-acp/0.58.1/win32-x64',
            platformDirectory: 'win32-x64',
            manifest: 'manifest.json',
            entrypoint: 'node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js',
            pathEntries: ['node_modules/.bin'],
            requiredFiles: ['package.json', 'package-lock.json'],
            requiredDirectories: ['node_modules'],
            platformExecutable: 'node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe',
          },
        ],
      });

      const oldRoot = join(managedRoot, 'acp', 'codex-acp', '0.16.0', 'win32-x64');
      writeJson(join(oldRoot, 'manifest.json'), {
        entrypoint: 'node_modules/@agentclientprotocol/codex-acp/dist/index.js',
        path_entries: ['node_modules/.bin'],
      });
      writeFile(join(oldRoot, 'node_modules', '@agentclientprotocol', 'codex-acp', 'dist', 'index.js'), 'x');
      writeJson(join(oldRoot, 'package.json'), {});
      writeJson(join(oldRoot, 'package-lock.json'), {});
      mkdirSync(join(oldRoot, 'node_modules'), { recursive: true });

      const result = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-InstallDir',
          installDir,
          '-RuntimeKey',
          'win32-x64',
          '-LogPath',
          logPath,
        ],
        { encoding: 'utf8' }
      );

      expect(result.status).not.toBe(0);
      const log = readFileSync(logPath, 'utf8');
      expect(log).toContain('codex-acp/1.1.2');
      expect(log).toContain('result=fail');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
