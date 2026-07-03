import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const processControl = readFileSync('resources/windows/installer-process-control.nsh', 'utf8');
const removeRegistry = readFileSync('resources/windows/installer-remove-registry.nsh', 'utf8');
const rstrtmgrUiSmoke = readFileSync('scripts/smoke-installer-rstrtmgr-ui.js', 'utf8');
const packageJson = readFileSync('package.json', 'utf8');

describe('Windows NSIS process control', () => {
  it('matches owned processes by install-directory executable path, not app name or Electron child flags', () => {
    const customCheck = processControl.slice(processControl.indexOf('!macro customCheckAppRunning'));

    expect(customCheck).toContain('!insertmacro AIONUI_SESSION_BEGIN');
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
    expect(processControl).toContain('!macro AIONUI_QUERY_LOCKERS _TARGET_PATH _RETURN');
    expect(processControl).toContain('RmStartSession');
    expect(processControl).toContain('RmRegisterResources');
    expect(processControl).toContain('RmGetList');
    expect(processControl).toContain('RmEndSession');
    expect(processControl).toContain('event=rm-lockers');
    expect(processControl).toContain('rm-error');
    expect(processControl).toContain('ERROR_MORE_DATA');
    expect(processControl).toContain('ERROR_ACCESS_DENIED');
    expect(processControl).toContain("$$targetPath = '${_TARGET_PATH}'");
    expect(processControl).toContain('RmRegisterResources($$session, [uint32]$$chunk.Count, $$chunk');
    expect(processControl).toContain('target=');
    expect(processControl).not.toContain('Add-RmFile');
    expect(processControl).toContain('Test-Path -LiteralPath $$targetPath -PathType Container');
    expect(processControl).toContain('event=rm-query-start');
    expect(processControl).toContain('Get-ChildItem -LiteralPath $$root -Force -File');
    expect(processControl).toContain("$$knownRelative = @('${AIONUI_APP_EXECUTABLE_FILENAME}'");
    expect(processControl).toContain('resources\\app.asar');
    expect(processControl).toContain('Select-Object -First 512');
    expect(processControl).not.toContain('Get-ChildItem -LiteralPath $$root -Force -Recurse -File');
    expect(processControl).not.toContain('Get-ChildItem -LiteralPath $$instDir -File');
    expect(processControl).not.toContain('Get-ChildItem -LiteralPath $$instDir -Recurse -File');
    expect(processControl).toContain('$$resources.Count');
    expect(processControl).toContain('$$result -ne 234');
    expect(processControl).not.toContain('RmShutdown');
    expect(processControl).not.toContain('RmRestart');
  });

  it('embeds Restart Manager C# source without command-line quote-sensitive DllImport text', () => {
    const queryMacro = processControl.slice(
      processControl.indexOf('!macro AIONUI_QUERY_LOCKERS'),
      processControl.indexOf('!macro AIONUI_WRITE_INSTALLER_LAST_FAILURE_MARKER'),
    );

    const sourceMatch = queryMacro.match(/FromBase64String\('([^']+)'\)/);
    expect(sourceMatch).not.toBeNull();

    const decodedSource = Buffer.from(sourceMatch![1], 'base64').toString('utf8');
    expect(decodedSource).toContain('[DllImport("rstrtmgr.dll"');
    expect(decodedSource).toContain('RmStartSession');
    expect(decodedSource).toContain('RmRegisterResources');
    expect(decodedSource).toContain('RmGetList');
    expect(decodedSource).toContain('RmEndSession');
    expect(queryMacro).not.toContain('[DllImport(');
    expect(queryMacro).not.toContain('$\\"rstrtmgr.dll');
  });

  it('shows Restart Manager lockers for the failed file in the non-silent retry prompt', () => {
    expect(processControl).toContain('Var /GLOBAL AionUiLockerList');
    expect(processControl).toContain('Var /GLOBAL AionUiLockerResult');
    expect(processControl).toContain('Var /GLOBAL AionUiLockerListFile');
    expect(processControl).toContain('SetDetailsPrint none');
    expect(processControl).toContain('FileOpen $AionUiLockerListFile');
    expect(processControl).toContain('FileRead $AionUiLockerListFile $AionUiLockerList');
    expect(processControl).toContain('AionUi cannot continue because a file or folder in the install directory is still in use:');
    expect(processControl).toContain('Application using it:');
    expect(processControl).toContain('New-Object System.Text.UTF8Encoding $$false');
    expect(processControl).toContain('${_FAILED_PATH}');
    expect(processControl).toContain('Goto ${_CONTINUE_LABEL}');
    expect(processControl).toContain('$AionUiLockerList');
    expect(processControl).toContain('Installer log:');
    expect(processControl).toContain('$$name + \'(\' + $$_.Process.dwProcessId + \')\'');
  });

  it('does not pre-scan the install directory for lockers before an uninstall failure occurs', () => {
    const customCheck = processControl.slice(processControl.indexOf('!macro customCheckAppRunning'));

    expect(customCheck).not.toContain('phase=pre-uninstall-lock-check');
    expect(customCheck).not.toContain('!insertmacro AIONUI_PROMPT_FAILED_PATH_LOCKERS "$INSTDIR" "pre-uninstall-lock-check"');
  });

  const windowsIt = process.platform === 'win32' ? it : it.skip;

  windowsIt('detects a real process that locks a file under the install directory', () => {
    const queryMacro = processControl.slice(
      processControl.indexOf('!macro AIONUI_QUERY_LOCKERS'),
      processControl.indexOf('!macro AIONUI_WRITE_INSTALLER_LAST_FAILURE_MARKER'),
    );
    const sourceMatch = queryMacro.match(/FromBase64String\('([^']+)'\)/);
    expect(sourceMatch).not.toBeNull();

    const decodedSource = Buffer.from(sourceMatch![1], 'base64').toString('utf8');
    const root = mkdtempSync(join(tmpdir(), 'aionui-rm-test-'));
    const escapedRoot = root.replace(/'/g, "''");
    const command = `
& {
$ErrorActionPreference = 'Stop'
$Root = '${escapedRoot}'
$source = @'
${decodedSource}
'@
Add-Type -TypeDefinition $source -ErrorAction Stop
$lockedFile = Join-Path $Root 'locked.txt'
Set-Content -LiteralPath $lockedFile -Value 'locked' -Encoding UTF8
$lockerScript = Join-Path $Root 'locker.ps1'
Set-Content -LiteralPath $lockerScript -Encoding UTF8 -Value @'
param([string]$Path)
$fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
try { Start-Sleep -Seconds 20 } finally { $fs.Dispose() }
'@
$proc = Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$lockerScript,$lockedFile) -PassThru -WindowStyle Hidden
Start-Sleep -Milliseconds 1000
function Get-RmLockers([string[]]$resources) {
  $session = [uint32]0
  $key = New-Object System.Text.StringBuilder 64
  $result = [AionUi.RestartManager.Native]::RmStartSession([ref]$session, 0, $key)
  if ($result -ne 0) { throw "RmStartSession=$result" }
  try {
    for ($i = 0; $i -lt $resources.Count; $i += 256) {
      $end = [Math]::Min($i + 255, $resources.Count - 1)
      $chunk = [string[]]$resources[$i..$end]
      $result = [AionUi.RestartManager.Native]::RmRegisterResources($session, [uint32]$chunk.Count, $chunk, 0, [IntPtr]::Zero, 0, $null)
      if ($result -ne 0) { throw "RmRegisterResources=$result" }
    }
    $ERROR_MORE_DATA = 234
    $ERROR_ACCESS_DENIED = 5
    for ($attempt = 0; $attempt -lt 6; $attempt++) {
      if ($attempt -gt 0) { Start-Sleep -Milliseconds (50 * $attempt) }
      $needed = [uint32]0; $count = [uint32]0; $reasons = [uint32]0
      $result = [AionUi.RestartManager.Native]::RmGetList($session, [ref]$needed, [ref]$count, $null, [ref]$reasons)
      if ($result -ne $ERROR_ACCESS_DENIED) { break }
    }
    if ($result -ne 0 -and $result -ne $ERROR_MORE_DATA) { throw "RmGetList=$result" }
    if ($needed -eq 0) { return @() }
    for ($attempt = 0; $attempt -lt 6; $attempt++) {
      if ($attempt -gt 0) { Start-Sleep -Milliseconds (50 * $attempt) }
      $count = $needed
      $apps = New-Object 'AionUi.RestartManager.RM_PROCESS_INFO[]' $count
      $result = [AionUi.RestartManager.Native]::RmGetList($session, [ref]$needed, [ref]$count, $apps, [ref]$reasons)
      if ($result -ne $ERROR_ACCESS_DENIED -and $result -ne $ERROR_MORE_DATA) { break }
    }
    if ($result -ne 0) { throw "RmGetList=$result" }
    return @($apps | Select-Object -First $count | Where-Object { $_.Process.dwProcessId -gt 0 } | ForEach-Object { "$($_.strAppName)($($_.Process.dwProcessId))" })
  } finally {
    [void][AionUi.RestartManager.Native]::RmEndSession($session)
  }
}
try {
  $directoryOnly = @(Get-RmLockers @($Root))
  $resources = @(Get-ChildItem -LiteralPath $Root -File -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  $resources = @($resources | Where-Object { $_.Trim().Length -gt 0 } | Select-Object -Unique)
  $fileAware = @(Get-RmLockers $resources)
  Write-Output ('lockerPid=' + $proc.Id)
  Write-Output ('directoryOnly=' + ($directoryOnly -join ','))
  Write-Output ('fileAware=' + ($fileAware -join ','))
  if ($directoryOnly.Count -ne 0) { throw 'expected directory-only Restart Manager registration not to find child file lockers' }
  if (-not ($fileAware -join ',' -match [regex]::Escape([string]$proc.Id))) { throw 'file-aware Restart Manager registration did not find the locking process' }
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
}
`;

    try {
      const output = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { encoding: 'utf8', timeout: 30_000 },
      );

      expect(output).toContain('directoryOnly=');
      expect(output).toContain('fileAware=');
      expect(output).toContain('Windows PowerShell');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  it('does not feed Restart Manager locker PIDs into Stop-Process', () => {
    const queryMacro = processControl.slice(processControl.indexOf('!macro AIONUI_QUERY_LOCKERS'));

    expect(queryMacro).not.toContain('Stop-Process');
  });

  it('exposes a lightweight NSIS UI harness for Restart Manager manual smoke testing', () => {
    expect(packageJson).toContain('"test:smoke:installer:rstrtmgr-ui": "node scripts/smoke-installer-rstrtmgr-ui.js"');
    expect(rstrtmgrUiSmoke).toContain('makensis.exe');
    expect(rstrtmgrUiSmoke).toContain('AIONUI_QUERY_LOCKERS');
    expect(rstrtmgrUiSmoke).toContain('locked-by-smoke.txt');
    expect(rstrtmgrUiSmoke).toContain('Application using the file:');
    expect(rstrtmgrUiSmoke).toContain('aionui-installer-smoke-');
    expect(rstrtmgrUiSmoke).toContain('--compile-only');
  });
});
