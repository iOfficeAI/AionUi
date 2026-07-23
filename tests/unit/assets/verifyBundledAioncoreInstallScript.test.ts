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
    expect(script).toContain('$Cli.executable');
    expect(script).not.toContain('Get-CodexPlatformExecutable');
    expect(script).not.toContain('x86_64-pc-windows-msvc');
  });

  it('logs machine-readable contract failures', () => {
    expect(script).toContain('duplicate_cli_name');
    expect(script).toContain('missing_required_cli');
    expect(script).toContain('unsupported_schema_version');
    expect(script).toContain('invalid_schema');
    expect(script).toContain('result=fail runtime=$RuntimeKey failures=$summary');
  });

  it('requires numeric schemaVersion without PowerShell string coercion', () => {
    expect(script).toContain("Test-NumberField $contract 'schemaVersion'");
    expect(script).not.toContain('if ($contract.schemaVersion -ne 2)');
  });

  const runOnWindows = process.platform === 'win32' ? it : it.skip;

  runOnWindows('fails an old-version-only Codex CLI install directory', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-install-verify-'));
    const installDir = join(tmp, 'install');
    const managedRoot = join(installDir, 'resources', 'bundled-aioncore', 'win32-x64', 'managed-resources');
    const logPath = join(tmp, 'verify.log');
    const codexTriple = 'x86_64-pc-windows-msvc';

    try {
      writeFile(join(installDir, 'resources', 'bundled-aioncore', 'win32-x64', 'aioncore.exe'), 'x');
      writeJson(join(installDir, 'resources', 'bundled-aioncore', 'win32-x64', 'manifest.json'), {
        platform: 'win32',
        arch: 'x64',
      });
      writeFile(join(managedRoot, 'node', 'node-v24.11.0-win-x64', 'node.exe'), 'x');
      // claude is present at its pinned version.
      writeFile(join(managedRoot, 'cli', 'claude', '2.1.215', 'win32-x64', 'claude.exe'), 'x');
      writeJson(join(managedRoot, 'manifest.json'), {
        schemaVersion: 2,
        runtimeKey: 'win32-x64',
        node: {
          version: '24.11.0',
          root: 'node/node-v24.11.0-win-x64',
          executable: 'node.exe',
        },
        clis: [
          {
            name: 'claude',
            version: '2.1.215',
            root: 'cli/claude/2.1.215/win32-x64',
            platformDirectory: 'win32-x64',
            executable: 'claude.exe',
            requiredFiles: [],
            requiredDirectories: [],
          },
          {
            name: 'codex',
            version: '0.144.6',
            root: 'cli/codex/0.144.6/win32-x64',
            platformDirectory: 'win32-x64',
            executable: `vendor/${codexTriple}/bin/codex.exe`,
            requiredFiles: [],
            requiredDirectories: [`vendor/${codexTriple}`],
          },
        ],
      });

      // Only an OLD codex version exists on disk; the contract pins 0.144.6.
      const oldRoot = join(managedRoot, 'cli', 'codex', '0.100.0', 'win32-x64');
      writeFile(join(oldRoot, 'vendor', codexTriple, 'bin', 'codex.exe'), 'x');

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
      expect(log).toContain('cli/codex/0.144.6');
      expect(log).toContain('result=fail');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
