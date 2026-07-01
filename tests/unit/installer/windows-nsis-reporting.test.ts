import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const windowsResourcesDir = 'resources/windows';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

function macroBody(content: string, name: string) {
  const start = content.indexOf(`!macro ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = content.indexOf('!macroend', start);
  expect(end).toBeGreaterThan(start);
  return content.slice(start, end);
}

describe('Windows NSIS active Sentry reporting', () => {
  it('sends reports only when the user selects Yes and attaches the session log', () => {
    const errorsSentry = read(join(windowsResourcesDir, 'installer-errors-sentry.nsh'));
    const failUx = macroBody(errorsSentry, 'AIONUI_FAIL_UX');
    const yesBranch = failUx.indexOf('IDYES +1');
    const noBranch = failUx.indexOf('IDNO +2');
    const reportCall = failUx.indexOf('!insertmacro AIONUI_REPORT_TO_SENTRY');
    const markerCleanup = failUx.indexOf('!insertmacro AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER');

    expect(errorsSentry).toContain('MB_YESNO|MB_ICONSTOP');
    expect(yesBranch).toBeGreaterThanOrEqual(0);
    expect(noBranch).toBeGreaterThan(yesBranch);
    expect(reportCall).toBeGreaterThan(noBranch);
    expect(markerCleanup).toBeGreaterThan(reportCall);
    expect(errorsSentry).toContain("filename = 'installer-session.log'");
    expect(errorsSentry).toContain('TimeoutSec 10');
    expect(errorsSentry).toContain('event=report-failed');
    expect(errorsSentry).toContain('event=report-skipped reason=empty-dsn');
  });

  it('cleans the active marker on both plain and consented fatal exits', () => {
    const errorsSentry = read(join(windowsResourcesDir, 'installer-errors-sentry.nsh'));
    const fail = macroBody(errorsSentry, 'AIONUI_FAIL');
    const failUx = macroBody(errorsSentry, 'AIONUI_FAIL_UX');
    const failCleanup = fail.indexOf('AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER');
    const failUxCleanup = failUx.indexOf('AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER');

    expect(failCleanup).toBeGreaterThanOrEqual(0);
    expect(failCleanup).toBeLessThan(fail.indexOf('Quit'));
    expect(failUxCleanup).toBeGreaterThanOrEqual(0);
    expect(failUxCleanup).toBeLessThan(failUx.indexOf('Quit'));
  });

  it('routes recovery fatal paths through user-consented reporting', () => {
    const repairHeal = read(join(windowsResourcesDir, 'installer-repair-heal.nsh'));
    const removeRegistry = read(join(windowsResourcesDir, 'installer-remove-registry.nsh'));

    expect(repairHeal).toContain('AIONUI_FAIL_REPORTABLE ${AIONUI_E_UNINSTALLER_COPY_OR_REBUILD_FAILED}');
    expect(repairHeal).toContain('AIONUI_FAIL_REPORTABLE ${AIONUI_E_OLD_UNINSTALL_FAILED}');
    expect(removeRegistry).toContain('AIONUI_FAIL_REPORTABLE ${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED}');
    expect(repairHeal).not.toContain('AIONUI_FAIL ${AIONUI_E_UNINSTALLER_COPY_OR_REBUILD_FAILED}');
    expect(repairHeal).not.toContain('AIONUI_FAIL ${AIONUI_E_OLD_UNINSTALL_FAILED}');
    expect(removeRegistry).not.toContain('AIONUI_FAIL ${AIONUI_E_INSTALL_DIR_REMOVE_OR_LOCKED}');
  });

  it('uses readable installer failure text without mojibake placeholders', () => {
    const errorsSentry = read(join(windowsResourcesDir, 'installer-errors-sentry.nsh'));

    expect(errorsSentry).toContain('AionUi installation failed');
    expect(errorsSentry).toContain('Send this installer failure report to the AionUi team?');
    expect(errorsSentry).not.toMatch(/[�]|瀹夎|澶辫|寤鸿|鏃ュ織|鏄惁/);
  });
});
