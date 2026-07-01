import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const buildScript = readFileSync('scripts/build-with-builder.js', 'utf8');
const arm64NsisScript = readFileSync('resources/windows/windows-installer-arm64.nsh', 'utf8');
const updateVerifyNsisScript = readFileSync('resources/windows/installer-update-verify.nsh', 'utf8');
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
    expect(arm64NsisScript).toContain('!define AIONUI_RUNTIME_KEY "win32-arm64"');
    expect(updateVerifyNsisScript).toContain('!macro customInstall');
    expect(updateVerifyNsisScript).toContain('AIONUI_VERIFY_CORE_APP_FILES');
    expect(updateVerifyNsisScript).toContain('AIONUI_VERIFY_REQUIRED_FILE');
    expect(updateVerifyNsisScript).toContain('AIONUI_VERIFY_BUNDLED_AIONCORE_RESOURCES "${AIONUI_RUNTIME_KEY}"');
    expect(updateVerifyNsisScript).toContain('verify-bundled-aioncore-install.ps1');
    expect(updateVerifyNsisScript).toContain('$INSTDIR\\AionUi.exe');
    expect(updateVerifyNsisScript).toContain('$INSTDIR\\ffmpeg.dll');
    expect(updateVerifyNsisScript).toContain('$INSTDIR\\vulkan-1.dll');
    expect(updateVerifyNsisScript).toContain('Bundled AionCore resources are incomplete after installation.');
    expect(updateVerifyNsisScript).toContain('AIONUI_FAIL_UX');
    expect(updateVerifyNsisScript).toContain('${AIONUI_E_CORE_APP_FILES_INCOMPLETE}');
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
