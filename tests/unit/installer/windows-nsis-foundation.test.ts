import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const windowsResourcesDir = 'resources/windows';
const supportDir = join(windowsResourcesDir, 'support');
const archIncludes = ['windows-installer-x64.nsh', 'windows-installer-arm64.nsh'];
const sharedIncludes = [
  'installer-common.nsh',
  'installer-observability.nsh',
  'installer-errors-sentry.nsh',
  'installer-process-control.nsh',
  'installer-remove-registry.nsh',
  'installer-repair-heal.nsh',
  'installer-update-verify.nsh',
];

function read(path: string) {
  return readFileSync(path, 'utf8');
}

describe('Windows NSIS foundation layout', () => {
  it('moves all Windows installer resources under resources/windows', () => {
    expect(existsSync(join('resources', 'windows-installer-x64.nsh'))).toBe(false);
    expect(existsSync(join('resources', 'windows-installer-arm64.nsh'))).toBe(false);
    expect(existsSync('resources/verify-bundled-aioncore-install.ps1')).toBe(false);

    for (const file of archIncludes) {
      expect(existsSync(join(windowsResourcesDir, file))).toBe(true);
    }
    expect(existsSync(join(supportDir, 'verify-bundled-aioncore-install.ps1'))).toBe(true);
  });

  it('keeps the Windows resource directory within the direct-child limit', () => {
    const directChildren = readdirSync(windowsResourcesDir);

    expect(directChildren).toEqual(expect.arrayContaining([...archIncludes, ...sharedIncludes, 'support']));
    expect(directChildren).toHaveLength(10);
  });

  it('uses shared includes from both architecture entry files without redefining shared macros', () => {
    const forbiddenSharedDefinitions = [
      'AIONUI_REPAIR_INSTALLED_UNINSTALLER',
      'AIONUI_REMOVE_INSTALL_DIR',
      'AIONUI_FIND_APP_PROCESS',
      'AIONUI_STOP_APP_PROCESSES',
    ];

    for (const file of archIncludes) {
      const content = read(join(windowsResourcesDir, file));

      expect(content).toContain('!include "installer-common.nsh"');
      expect(content).toMatch(/!define AIONUI_TARGET_ARCH "(x64|arm64)"/);
      expect(content).toMatch(/!define AIONUI_RUNTIME_KEY "win32-(x64|arm64)"/);

      for (const macroName of forbiddenSharedDefinitions) {
        expect(content).not.toMatch(new RegExp(`!macro\\s+${macroName}\\b`));
      }
    }
  });

  it('defines the common include order and PR1 observability/reporting skeleton', () => {
    const common = read(join(windowsResourcesDir, 'installer-common.nsh'));
    const observability = read(join(windowsResourcesDir, 'installer-observability.nsh'));
    const errorsSentry = read(join(windowsResourcesDir, 'installer-errors-sentry.nsh'));
    const reportScript = read(join(windowsResourcesDir, 'support/report-installer-failure.ps1'));
    const updateVerify = read(join(windowsResourcesDir, 'installer-update-verify.nsh'));

    expect(common).toContain('!ifndef AIONUI_INSTALLER_COMMON_NSH');
    for (const include of sharedIncludes.filter((file) => file !== 'installer-common.nsh')) {
      expect(common).toContain(`!include "${include}"`);
    }

    expect(observability).toContain('!macro AIONUI_SLOG');
    expect(observability).toContain('aionui-installer-${VERSION}-');
    expect(observability).toContain('yyyyMMdd-HHmmss');
    expect(observability).toContain('AionUiSessionLogPath');
    expect(observability).toContain('[Console]::Out.Write($$id + \'|\' + $$log)');
    expect(observability).toContain('${If} $AionUiSessionLogPath == ""');
    expect(observability).toContain('event=session-begin');
    expect(observability).toContain('event=extract result=ok');
    expect(observability).toContain('event=session-end result=success');

    for (const code of ['E1001', 'E1002', 'E1003', 'E1010', 'E1020', 'E1030', 'E1031', 'E1040', 'E1090']) {
      expect(errorsSentry).toContain(code);
    }
    expect(errorsSentry).toContain('!macro AIONUI_FAIL ');
    expect(errorsSentry).toContain('!macro AIONUI_FAIL_UX ');
    expect(errorsSentry).toContain('!macro AIONUI_REPORT_TO_SENTRY ');
    expect(errorsSentry).toContain('AIONUI_SENTRY_DSN');
    expect(errorsSentry).toContain('report-installer-failure.ps1');
    expect(reportScript).toContain('report-skipped reason=empty-dsn');
    expect(reportScript).toContain('aionui-installer-report.json');

    expect(updateVerify).toContain('verify-bundled-aioncore-install.ps1');
    expect(updateVerify).toContain('resources\\windows\\support');
  });

  it('generates Sentry DSN include at build time and never tracks tokens in installer resources', () => {
    const buildScript = read('scripts/build-with-builder.js');
    const gitignore = read('.gitignore');
    const allInstallerText = [
      buildScript,
      ...archIncludes.map((file) => read(join(windowsResourcesDir, file))),
      ...sharedIncludes.map((file) => read(join(windowsResourcesDir, file))),
    ].join('\n');

    expect(buildScript).toContain('resources/windows/support/_sentry-dsn.generated.nsh');
    expect(gitignore).toContain('/resources/windows/support/_sentry-dsn.generated.nsh');
    expect(allInstallerText).not.toMatch(/SENTRY_AUTH_TOKEN|Authorization:|Bearer|authToken/);
  });
});
