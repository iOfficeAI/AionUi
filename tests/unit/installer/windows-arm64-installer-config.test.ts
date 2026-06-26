import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const buildScript = readFileSync('scripts/build-with-builder.js', 'utf8');
const arm64NsisScript = readFileSync('resources/windows-installer-arm64.nsh', 'utf8');
const prChecksWorkflow = readFileSync('.github/workflows/pr-checks.yml', 'utf8');
const releaseWorkflow = readFileSync('.github/workflows/build-and-release.yml', 'utf8');

describe('Windows ARM64 installer hardening', () => {
  it('uses zip packaging for the ARM64 NSIS installer to avoid the Nsis7z extraction path', () => {
    const arm64Branch = buildScript.slice(
      buildScript.indexOf("if (targetArch === 'arm64')"),
      buildScript.indexOf("} else if (targetArch === 'x64')")
    );
    const x64Branch = buildScript.slice(
      buildScript.indexOf("} else if (targetArch === 'x64')"),
      buildScript.indexOf('    // 多架构构建')
    );

    expect(arm64Branch).toContain('--config.nsis.useZip=true');
    expect(x64Branch).not.toContain('--config.nsis.useZip=true');
  });

  it('fails the ARM64 installer when required app or bundled runtime files are missing after install', () => {
    expect(arm64NsisScript).toContain('!macro customInstall');
    expect(arm64NsisScript).toContain('AIONUI_VERIFY_REQUIRED_FILE');
    expect(arm64NsisScript).toContain('AIONUI_VERIFY_BUNDLED_AIONCORE_RESOURCES "win32-arm64"');
    expect(arm64NsisScript).toContain('verify-bundled-aioncore-install.ps1');
    expect(arm64NsisScript).toContain('$INSTDIR\\AionUi.exe');
    expect(arm64NsisScript).toContain('$INSTDIR\\ffmpeg.dll');
    expect(arm64NsisScript).toContain('$INSTDIR\\vulkan-1.dll');
    expect(arm64NsisScript).toContain('Bundled AionCore resources are incomplete after installation.');
    expect(arm64NsisScript).toMatch(/SetErrorLevel\s+3/);
    expect(arm64NsisScript).toContain('Quit');
  });

  it('keeps PR build tests focused on representative platforms', () => {
    const prBuildTestJob = prChecksWorkflow.slice(
      prChecksWorkflow.indexOf('  build-test:'),
      prChecksWorkflow.indexOf('  # Job 5: Test release scripts')
    );

    expect(prBuildTestJob).toContain("platform: 'macos-arm64'");
    expect(prBuildTestJob).toContain("platform: 'windows-x64'");
    expect(prBuildTestJob).toContain("platform: 'linux-x64'");
    expect(prBuildTestJob).not.toContain("platform: 'windows-arm64'");
    expect(prBuildTestJob).not.toContain("platform: 'macos-x64'");
  });

  it('keeps Windows ARM64 coverage in the release build matrix', () => {
    const releaseBuildMatrix = releaseWorkflow.slice(
      releaseWorkflow.indexOf('matrix: >-'),
      releaseWorkflow.indexOf('    secrets: inherit')
    );

    expect(releaseBuildMatrix).toContain('"platform":"windows-arm64"');
    expect(releaseBuildMatrix).toContain('node scripts/build-with-builder.js arm64 --win --arm64');
  });
});
