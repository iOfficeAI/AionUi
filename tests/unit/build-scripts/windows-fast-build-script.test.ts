import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { parse, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const buildScript = readFileSync('scripts/build-with-builder.js', 'utf8');
const nativeRebuildScript = readFileSync('scripts/rebuildNativeModules.js', 'utf8');
const installerStateScript = resolve('resources/windows/support/installer-state.ps1');

describe('Windows fast build scripts', () => {
  it('provides an x64 fast installer build that preserves executable version resources', () => {
    const script = packageJson.scripts['build-win:x64:fast'];

    expect(script).toBeTypeOf('string');
    expect(script).toContain('ELECTRON_BUILDER_COMPRESSION_LEVEL=1');
    expect(script).toContain('node scripts/build-with-builder.js x64 --win --x64');
    expect(script).not.toContain('signAndEditExecutable=false');
    expect(buildScript).not.toContain('signAndEditExecutable=false');
  });

  it('retries only the transient Windows unpack directory race without disabling metadata editing', () => {
    expect(buildScript).toContain('buildWithTransientWindowsUnpackRetry(builderCommand, targetArch)');
    expect(buildScript).toContain("path.join(outDir, 'win-unpacked.tmp')");
    expect(buildScript).toContain("path.join(outDir, 'win-unpacked')");
    expect(buildScript).toContain('WINDOWS_UNPACK_RETRY_MAX = 1');
    expect(buildScript).not.toContain('signAndEditExecutable=false');
  });

  it('propagates --skip-native to the afterPack hook', () => {
    const afterPackScript = readFileSync('scripts/afterPack.js', 'utf8');

    expect(buildScript).toContain("process.env.SKIP_NATIVE_REBUILD = 'true'");
    expect(afterPackScript).toContain("process.env.SKIP_NATIVE_REBUILD === 'true'");
    expect(afterPackScript).toContain('if (skipNativeRebuild)');
  });

  it('uses lockfile-resolved native rebuild tools instead of downloading latest CLIs', () => {
    expect(nativeRebuildScript).toContain("require.resolve('@electron/rebuild'");
    expect(nativeRebuildScript).toContain("require.resolve('prebuild-install'");
    expect(nativeRebuildScript).toContain('runPinnedNodeCli({');
    expect(nativeRebuildScript).not.toContain("'--yes'");
    expect(nativeRebuildScript).not.toContain('bun x');
  });

  it('uses builder metadata without patching Windows executable branding', () => {
    const afterPackScript = readFileSync('scripts/afterPack.js', 'utf8');
    const builderConfig = readFileSync('packages/desktop/electron-builder.yml', 'utf8');

    expect(builderConfig).toContain('productName: CSBU WorkMate');
    expect(builderConfig).toContain('copyright: Copyright © 2026 CSBU');
    expect(afterPackScript).not.toContain('setWindowsExecutableMetadata');
    expect(buildScript).not.toContain('锐捷Codex');
  });

  it.runIf(process.platform === 'win32')('round-trips registry-free installer state atomically', () => {
    const tempDirectory = mkdtempSync(resolve(tmpdir(), 'csbu-installer-state-'));
    const localAppData = resolve(tempDirectory, 'local-app-data');
    const installDirectory = resolve(tempDirectory, 'custom-install');
    const uninstallerPath = resolve(installDirectory, 'Uninstall CSBU WorkMate.exe');

    try {
      mkdirSync(installDirectory, { recursive: true });
      writeFileSync(resolve(installDirectory, 'CSBU WorkMate.exe'), 'application');
      writeFileSync(uninstallerPath, 'uninstaller');
      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          installerStateScript,
          '-Action',
          'write',
          '-ExpectedArch',
          'x64',
          '-InstallDir',
          installDirectory,
          '-Version',
          '2.1.50',
          '-UninstallerPath',
          uninstallerPath,
          '-StateRoot',
          localAppData,
        ],
        {}
      );

      const statePath = resolve(localAppData, 'CSBU WorkMate', 'installer-state.ini');
      expect(readFileSync(statePath, 'utf8')).toContain('AppId=com.csbu.workmate');
      expect(
        spawnSync(
          'powershell',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            installerStateScript,
            '-Action',
            'read',
            '-ExpectedArch',
            'x64',
            '-StateRoot',
            localAppData,
          ],
          {}
        ).status
      ).toBe(0);

      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          installerStateScript,
          '-Action',
          'delete',
          '-StateRoot',
          localAppData,
        ],
        {}
      );
      expect(() => readFileSync(statePath)).toThrow();
    } finally {
      rmSync(tempDirectory, { force: true, recursive: true });
    }
  });

  it.runIf(process.platform === 'win32')('rejects an installer state that targets a broad directory', () => {
    const tempDirectory = mkdtempSync(resolve(tmpdir(), 'csbu-installer-state-invalid-'));
    const localAppData = resolve(tempDirectory, 'local-app-data');
    const broadRoot = parse(tempDirectory).root;
    const result = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        installerStateScript,
        '-Action',
        'write',
        '-ExpectedArch',
        'x64',
        '-InstallDir',
        broadRoot,
        '-Version',
        '2.1.50',
        '-UninstallerPath',
        resolve(broadRoot, 'Uninstall CSBU WorkMate.exe'),
        '-StateRoot',
        localAppData,
      ],
      { encoding: 'utf8' }
    );

    rmSync(tempDirectory, { force: true, recursive: true });
    expect(result.status).toBe(11);
  });

  it('supports a temporary build-time auto-update version override', () => {
    expect(buildScript).toContain(
      "DEBUG_AUTO_UPDATE_CURRENT_VERSION_ENV = 'CSBU_WORKMATE_DEBUG_AUTO_UPDATE_CURRENT_VERSION'"
    );
    expect(buildScript).toContain('applyDebugAutoUpdateVersionOverride(packageJsonPath)');
    expect(buildScript).toContain('const originalPackageJsonText = fs.readFileSync(packageJsonPath,');
    expect(buildScript).toContain('packageJson.version = debugAutoUpdateCurrentVersion');
    expect(buildScript).toContain('fs.writeFileSync(packageJsonPath, originalPackageJsonText)');
    expect(buildScript).toMatch(/finally\s*{[\s\S]*restorePackageVersionOverride\(\);[\s\S]*}/);
  });
});
