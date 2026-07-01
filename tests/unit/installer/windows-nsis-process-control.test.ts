import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const processControl = readFileSync('resources/windows/installer-process-control.nsh', 'utf8');

describe('Windows NSIS process control', () => {
  it('matches owned processes by install-directory executable path, not app name or Electron child flags', () => {
    expect(processControl).toContain('event=process-find instDir=');
    expect(processControl).toContain('$$ownedPrefix');
    expect(processControl).toContain('StartsWith($$ownedPrefix');
    expect(processControl).toContain('ProcessId -ne $$installerPid');
    expect(processControl).not.toContain("Name -ieq '${AIONUI_APP_EXECUTABLE_FILENAME}'");
    expect(processControl).not.toContain("--type=");
  });

  it('revalidates each child process path before stopping it', () => {
    const stopMacro = processControl.slice(
      processControl.indexOf('!macro AIONUI_STOP_APP_PROCESSES'),
      processControl.indexOf('!macro customCheckAppRunning')
    );

    expect(stopMacro).toContain('event=process-stop ids=');
    expect(stopMacro).toContain('Where-Object { Test-AionUiOwnedProcess $$_ }');
    expect(stopMacro).toContain('Stop-Process -Id $$id');
  });

  it('queries Restart Manager for diagnostics without shutting down external lockers', () => {
    expect(processControl).toContain('!macro AIONUI_QUERY_LOCKERS');
    expect(processControl).toContain('RmStartSession');
    expect(processControl).toContain('RmRegisterResources');
    expect(processControl).toContain('RmGetList');
    expect(processControl).toContain('RmEndSession');
    expect(processControl).toContain('event=rm-lockers');
    expect(processControl).toContain('rm-error');
    expect(processControl).toContain('ERROR_MORE_DATA');
    expect(processControl).toContain('$$result -ne 234');
    expect(processControl).not.toContain('RmShutdown');
    expect(processControl).not.toContain('RmRestart');
  });

  it('shows Restart Manager lockers in the non-silent retry prompt', () => {
    expect(processControl).toContain('Var /GLOBAL AionUiLockerList');
    expect(processControl).toContain('SetDetailsPrint none');
    expect(processControl).toContain('FileOpen $AionUiLockerListFile');
    expect(processControl).toContain('FileRead $AionUiLockerListFile $AionUiLockerList');
    expect(processControl).toContain('Locking processes: $AionUiLockerList');
    expect(processControl).toContain('$$name + \'(\' + $$_.Process.dwProcessId + \')\'');
  });

  it('does not feed Restart Manager locker PIDs into Stop-Process', () => {
    const queryMacro = processControl.slice(processControl.indexOf('!macro AIONUI_QUERY_LOCKERS'));

    expect(queryMacro).not.toContain('Stop-Process');
  });
});
