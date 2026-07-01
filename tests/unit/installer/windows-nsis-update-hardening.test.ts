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
    expect(updateVerify).toContain('event=installer-reentry');
    expect(updateVerify).toContain('!macroundef ALLOW_ONLY_ONE_INSTALLER_INSTANCE');
    expect(updateVerify).toContain('Abort');
    expect(x64).toContain('AIONUI_INSTALLER_CUSTOM_HEADER');
    expect(arm64).toContain('AIONUI_INSTALLER_CUSTOM_HEADER');
  });

  it('captures active marker stdout with ExecToStack and cleans markers before reentry aborts', () => {
    const updateVerify = read(join(windowsResourcesDir, 'installer-update-verify.nsh'));
    const recordMarker = macroBody(updateVerify, 'AIONUI_RECORD_ACTIVE_INSTALLER_MARKER');
    const singleInstance = macroBody(updateVerify, 'AIONUI_OVERRIDE_SINGLE_INSTANCE');
    const clearIndex = singleInstance.indexOf('AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER');
    const abortIndex = singleInstance.indexOf('Abort');

    expect(recordMarker).toContain('nsExec::ExecToStack');
    expect(recordMarker).toContain('Pop $AionUiActiveMarkerExecResult');
    expect(recordMarker).toContain('Pop $AionUiActiveMarkerResult');
    expect(recordMarker).not.toContain('nsExec::Exec `');
    expect(clearIndex).toBeGreaterThanOrEqual(0);
    expect(clearIndex).toBeLessThan(abortIndex);
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
