import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const buildScript = readFileSync('scripts/build-with-builder.js', 'utf8');
const arm64NsisScript = readFileSync('resources/windows-installer-arm64.nsh', 'utf8');
const prChecksWorkflow = readFileSync('.github/workflows/pr-checks.yml', 'utf8');

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

  it('fails the ARM64 installer when required runtime files are missing after install', () => {
    expect(arm64NsisScript).toContain('!macro customInstall');
    expect(arm64NsisScript).toContain('AIONUI_VERIFY_REQUIRED_FILE');
    expect(arm64NsisScript).toContain('$INSTDIR\\AionUi.exe');
    expect(arm64NsisScript).toContain('$INSTDIR\\ffmpeg.dll');
    expect(arm64NsisScript).toContain('$INSTDIR\\vulkan-1.dll');
    expect(arm64NsisScript).toContain('$INSTDIR\\resources\\bundled-aioncore\\win32-arm64\\aioncore.exe');
    expect(arm64NsisScript).toContain(
      '$INSTDIR\\resources\\bundled-aioncore\\win32-arm64\\managed-resources\\node\\node-v24.11.0-win-arm64\\node.exe'
    );
    expect(arm64NsisScript).toMatch(/SetErrorLevel\s+3/);
    expect(arm64NsisScript).toContain('Quit');
  });

  it('runs a real Windows ARM64 install smoke check instead of only checking unpacked contents', () => {
    const arm64SmokeStep = prChecksWorkflow.slice(
      prChecksWorkflow.indexOf("if: matrix.platform == 'windows-arm64'"),
      prChecksWorkflow.indexOf('      - name: Install smoke test (macOS arm64)')
    );

    expect(arm64SmokeStep).not.toContain('Skipping runtime install smoke for windows-arm64');
    expect(arm64SmokeStep).toContain("Start-Process -FilePath $installer.FullName -ArgumentList '/S'");
    expect(arm64SmokeStep).toContain('$env:LOCALAPPDATA\\\\Programs\\\\AionUi\\\\AionUi.exe');
    expect(arm64SmokeStep).toContain('resources\\\\bundled-aioncore\\\\win32-arm64\\\\aioncore.exe');
  });
});
