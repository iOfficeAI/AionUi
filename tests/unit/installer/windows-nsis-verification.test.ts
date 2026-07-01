import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const x64NsisScript = readFileSync('resources/windows/windows-installer-x64.nsh', 'utf8');
const arm64NsisScript = readFileSync('resources/windows/windows-installer-arm64.nsh', 'utf8');
const updateVerifyNsisScript = readFileSync('resources/windows/installer-update-verify.nsh', 'utf8');
const processControlNsisScript = readFileSync('resources/windows/installer-process-control.nsh', 'utf8');
const errorsSentryNsisScript = readFileSync('resources/windows/installer-errors-sentry.nsh', 'utf8');

const coreFileLabels = [
  'AionUi.exe',
  'ffmpeg.dll',
  'libEGL.dll',
  'libGLESv2.dll',
  'd3dcompiler_47.dll',
  'dxcompiler.dll',
  'dxil.dll',
  'vk_swiftshader.dll',
  'vulkan-1.dll',
  'resources\\app.asar',
];

describe('Windows NSIS final verification hardening', () => {
  it('uses one shared core app verification macro for x64 and arm64 before bundled runtime verification', () => {
    expect(x64NsisScript).toContain('!define AIONUI_RUNTIME_KEY "win32-x64"');
    expect(arm64NsisScript).toContain('!define AIONUI_RUNTIME_KEY "win32-arm64"');
    expect(updateVerifyNsisScript).toContain('!macro AIONUI_VERIFY_CORE_APP_FILES');
    expect(updateVerifyNsisScript).not.toContain('!macro AIONUI_VERIFY_ARM64_APP_FILES');

    for (const label of coreFileLabels) {
      expect(updateVerifyNsisScript).toContain(`"${label}"`);
    }

    const customInstall = updateVerifyNsisScript.slice(updateVerifyNsisScript.indexOf('!macro customInstall'));
    const coreIndex = customInstall.indexOf('AIONUI_VERIFY_CORE_APP_FILES');
    const bundledIndex = customInstall.indexOf('AIONUI_VERIFY_BUNDLED_AIONCORE_RESOURCES "${AIONUI_RUNTIME_KEY}"');

    expect(coreIndex).toBeGreaterThanOrEqual(0);
    expect(bundledIndex).toBeGreaterThan(coreIndex);
  });

  it('routes missing core app files through E1031 UX failure with label and path details', () => {
    expect(updateVerifyNsisScript).toContain('AIONUI_FAIL_UX');
    expect(updateVerifyNsisScript).toContain('${AIONUI_E_CORE_APP_FILES_INCOMPLETE}');
    expect(updateVerifyNsisScript).toContain('missing label=${_LABEL} path=${_PATH}');
    expect(updateVerifyNsisScript).not.toMatch(/SetErrorLevel\s+3\s*\r?\n\s*Quit/);
  });

  it('writes a one-shot silent update marker when app close retries are exhausted', () => {
    expect(processControlNsisScript).toContain('installer-last-failure.json');
    expect(processControlNsisScript).toContain('${Silent}');
    expect(processControlNsisScript).toContain('schemaVersion = 1');
    expect(processControlNsisScript).toContain("kind = 'app-cannot-be-closed'");
    expect(processControlNsisScript).toContain("phase = 'customCheckAppRunning'");
    expect(processControlNsisScript).toContain('silent = $$true');
    expect(processControlNsisScript).toContain('updated = $$true');
    expect(processControlNsisScript).toContain('retryCount = 3');
    expect(processControlNsisScript).toContain('$$env:APPDATA');
  });

  it('keeps touched NSIS user-facing text free of placeholder and mojibake markers', () => {
    const touchedNsisText = [updateVerifyNsisScript, processControlNsisScript, errorsSentryNsisScript].join('\n');
    const mojibakeCodePoints = new Set([
      0xfffd,
      0x7019,
      0x6f8d,
      0x5bf0,
      0x93c3,
      0x934f,
      0x9411,
      0x921e,
      0x9205,
      0x951b,
    ]);

    expect(touchedNsisText).not.toMatch(/\?{3,}/);
    expect([...touchedNsisText].some((char) => mojibakeCodePoints.has(char.codePointAt(0) ?? 0))).toBe(false);
    expect(errorsSentryNsisScript).not.toMatch(/[^\x00-\x7F]/);
  });
});
