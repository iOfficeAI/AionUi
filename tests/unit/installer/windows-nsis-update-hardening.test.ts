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

describe('Windows NSIS update race hardening', () => {
  it('waits at the beginning of app-running checks before process find/stop logic', () => {
    const updateVerify = read(join(windowsResourcesDir, 'installer-update-verify.nsh'));
    const processControl = read(join(windowsResourcesDir, 'installer-process-control.nsh'));
    const checkAppRunning = macroBody(processControl, 'customCheckAppRunning');
    const waitIndex = checkAppRunning.indexOf('AIONUI_WAIT_FOR_UPDATED_APP_EXIT');
    const findIndex = checkAppRunning.indexOf('AIONUI_FIND_APP_PROCESS');

    expect(updateVerify).toContain('!macro AIONUI_WAIT_FOR_UPDATED_APP_EXIT');
    expect(updateVerify).toContain('${isUpdated}');
    expect(updateVerify).toContain('event=updated-app-exit-wait phase=start');
    expect(updateVerify).toContain('event=updated-app-exit-wait phase=done');
    expect(updateVerify).toContain('AIONUI_STOP_APP_PROCESSES');
    expect(waitIndex).toBeGreaterThanOrEqual(0);
    expect(waitIndex).toBeLessThan(findIndex);
    expect(macroBody(updateVerify, 'customInstall')).not.toContain('AIONUI_WAIT_FOR_UPDATED_APP_EXIT');
  });

  it('records active installer markers and preserves single-instance blocking on reentry', () => {
    const updateVerify = read(join(windowsResourcesDir, 'installer-update-verify.nsh'));
    const x64 = read(join(windowsResourcesDir, 'windows-installer-x64.nsh'));
    const arm64 = read(join(windowsResourcesDir, 'windows-installer-arm64.nsh'));

    expect(updateVerify).toContain('!macro AIONUI_WRITE_ACTIVE_INSTALLER_MARKER');
    expect(updateVerify).toContain('!macro AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER');
    expect(updateVerify).toContain('event=installer-active-marker state=active');
    expect(updateVerify).toContain('event=installer-active-marker state=stale');
    expect(x64).toContain('AIONUI_INSTALLER_CUSTOM_HEADER');
    expect(arm64).toContain('AIONUI_INSTALLER_CUSTOM_HEADER');
  });

  it('captures active marker stdout with ExecToStack and keeps marker cleanup wired', () => {
    const updateVerify = read(join(windowsResourcesDir, 'installer-update-verify.nsh'));
    const recordMarker = macroBody(updateVerify, 'AIONUI_RECORD_ACTIVE_INSTALLER_MARKER');
    const failCleanupIndex = updateVerify.indexOf('AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER');

    expect(recordMarker).toContain('nsExec::ExecToStack');
    expect(recordMarker).toContain('Pop $AionUiActiveMarkerExecResult');
    expect(recordMarker).toContain('Pop $AionUiActiveMarkerResult');
    expect(recordMarker).not.toContain('nsExec::Exec `');
    expect(failCleanupIndex).toBeGreaterThanOrEqual(0);
  });

  it('does not define electron-builder single-instance macro in the custom include', () => {
    const updateVerify = read(join(windowsResourcesDir, 'installer-update-verify.nsh'));

    expect(updateVerify).not.toContain('!macro ALLOW_ONLY_ONE_INSTALLER_INSTANCE');
    expect(updateVerify).not.toContain('!macroundef ALLOW_ONLY_ONE_INSTALLER_INSTANCE');
  });

  it('keeps customHeader free of runtime stack commands', () => {
    const updateVerify = read(join(windowsResourcesDir, 'installer-update-verify.nsh'));
    const customHeader = macroBody(updateVerify, 'AIONUI_INSTALLER_CUSTOM_HEADER');

    expect(customHeader).not.toContain('AIONUI_SESSION_HEADER');
    expect(customHeader).not.toContain('AIONUI_SLOG');
  });

  it('uses an explicit PowerShell path in process-control macros', () => {
    const processControl = read(join(windowsResourcesDir, 'installer-process-control.nsh'));

    expect(processControl).not.toContain('$PowerShellPath');
    expect(processControl).toContain('$SYSDIR\\WindowsPowerShell\\v1.0\\powershell.exe');
  });

  it('declares process-stop result before shared process-stop macro use', () => {
    const processControl = read(join(windowsResourcesDir, 'installer-process-control.nsh'));

    expect(processControl.indexOf('Var /GLOBAL AionUiStopResult')).toBeLessThan(
      processControl.indexOf('!macro AIONUI_STOP_APP_PROCESSES'),
    );
  });

  it('does not pop active marker variables while compiling the uninstaller', () => {
    const updateVerify = read(join(windowsResourcesDir, 'installer-update-verify.nsh'));
    const clearMarker = macroBody(updateVerify, 'AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER');
    const preInit = macroBody(updateVerify, 'AIONUI_INSTALLER_PREINIT');

    expect(clearMarker.indexOf('!ifndef BUILD_UNINSTALLER')).toBeGreaterThanOrEqual(0);
    expect(clearMarker.indexOf('!ifndef BUILD_UNINSTALLER')).toBeLessThan(
      clearMarker.indexOf('Pop $AionUiActiveMarkerResult'),
    );
    expect(preInit.indexOf('!ifdef BUILD_UNINSTALLER')).toBeGreaterThanOrEqual(0);
    expect(preInit.indexOf('!else')).toBeLessThan(preInit.indexOf('AIONUI_RECORD_ACTIVE_INSTALLER_MARKER'));
  });

  it('brings non-silent update installers to the foreground during preInit', () => {
    const updateVerify = read(join(windowsResourcesDir, 'installer-update-verify.nsh'));
    const focusMacro = macroBody(updateVerify, 'AIONUI_BRING_UPDATED_INSTALLER_TO_FRONT');
    const preInit = macroBody(updateVerify, 'AIONUI_INSTALLER_PREINIT');
    const installerBranchIndex = preInit.indexOf('!else');

    expect(focusMacro).toContain('${isUpdated}');
    expect(focusMacro).toContain('BringToFront');
    expect(focusMacro).toContain('event=updated-installer-foreground');
    expect(preInit.indexOf('AIONUI_BRING_UPDATED_INSTALLER_TO_FRONT')).toBeGreaterThan(installerBranchIndex);
    expect(preInit.indexOf('AIONUI_BRING_UPDATED_INSTALLER_TO_FRONT')).toBeLessThan(
      preInit.indexOf('AIONUI_RECORD_ACTIVE_INSTALLER_MARKER'),
    );
  });

  it('initializes installer-only global variables while compiling the uninstaller', () => {
    const updateVerify = read(join(windowsResourcesDir, 'installer-update-verify.nsh'));
    const preInit = macroBody(updateVerify, 'AIONUI_INSTALLER_PREINIT');
    const uninstallerBranchIndex = preInit.indexOf('!ifdef BUILD_UNINSTALLER');
    const installerBranchIndex = preInit.indexOf('!else');
    const initializedVariables = [
      'AionUiSessionId',
      'AionUiIsUpdated',
      'AionUiSessionLogResult',
      'AionUiUninstallHadErrors',
      'AionUiUninstallLogResult',
      'AionUiVerifyResourceResult',
      'AionUiUpdatedAppExitWaitResult',
      'AionUiActiveMarkerExecResult',
      'AionUiActiveMarkerResult',
      'AionUiStopResult',
    ];

    expect(uninstallerBranchIndex).toBeGreaterThanOrEqual(0);
    for (const variable of initializedVariables) {
      const resetIndex = preInit.indexOf(`StrCpy $${variable}`);
      expect(resetIndex).toBeGreaterThan(uninstallerBranchIndex);
      expect(resetIndex).toBeLessThan(installerBranchIndex);
    }
  });

  it('does not add a private updater launcher or cache rewrite', () => {
    const allInstallerText = [
      'installer-update-verify.nsh',
      'windows-installer-x64.nsh',
      'windows-installer-arm64.nsh',
    ]
      .map((file) => read(join(windowsResourcesDir, file)))
      .join('\n');

    expect(allInstallerText).not.toMatch(/launcher|spawn|download cache|installDirectory/i);
  });
});
