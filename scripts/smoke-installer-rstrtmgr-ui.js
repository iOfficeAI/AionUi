#!/usr/bin/env node

const { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

function nsisQuote(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '$\\"').replace(/\$/g, '$$');
}

function findMakensis() {
  if (process.env.MAKENSIS && existsSync(process.env.MAKENSIS)) {
    return process.env.MAKENSIS;
  }

  const localAppData = process.env.LOCALAPPDATA;
  const cacheRoot = localAppData ? path.join(localAppData, 'electron-builder', 'Cache') : '';
  const candidates = [];

  function walk(dir, depth = 0) {
    if (!dir || depth > 5 || !existsSync(dir)) {
      return;
    }

    for (const entry of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase() === 'makensis.exe') {
        candidates.push(full);
      }
    }
  }

  walk(cacheRoot);
  candidates.sort((a, b) => b.localeCompare(a));

  if (candidates[0]) {
    return candidates[0];
  }

  const fromPath = spawnSync('where.exe', ['makensis.exe'], { encoding: 'utf8' });
  if (fromPath.status === 0) {
    const first = fromPath.stdout.split(/\r?\n/).find(Boolean);
    if (first && existsSync(first)) {
      return first;
    }
  }

  throw new Error('makensis.exe not found. Run a Windows build once or set MAKENSIS=C:\\path\\to\\makensis.exe');
}

function spawnLocker(lockedFile) {
  const script = `
$ErrorActionPreference = 'Stop'
$path = ${JSON.stringify(lockedFile)}
$fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
try {
  while ($true) { Start-Sleep -Seconds 1 }
} finally {
  $fs.Dispose()
}
`;

  return spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    detached: false,
    stdio: 'ignore',
    windowsHide: true,
  });
}

function main() {
  if (process.platform !== 'win32') {
    throw new Error('This smoke test only runs on Windows.');
  }

  const compileOnly = process.argv.includes('--compile-only');
  const makensis = findMakensis();
  const root = mkdtempSync(path.join(tmpdir(), 'csbu-workmate-rm-ui-'));
  const installDir = path.join(root, 'install-dir');
  mkdirSync(installDir, { recursive: true });
  const lockedFile = path.join(installDir, 'locked-by-smoke.txt');
  writeFileSync(lockedFile, 'CSBU WorkMate Restart Manager UI smoke lock\n', 'utf8');

  let locker = null;
  const nsiPath = path.join(root, 'csbu-workmate-rstrtmgr-ui-smoke.nsi');
  const exePath = path.join(root, 'csbu-workmate-rstrtmgr-ui-smoke.exe');
  const logPath = path.join(
    process.env.TEMP || tmpdir(),
    `csbu-workmate-installer-smoke-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')}.log`
  );
  const processControlPath = path.join(repoRoot, 'resources', 'windows', 'installer-process-control.nsh');
  const messagesPath = path.join(repoRoot, 'resources', 'windows', 'installer-messages.nsh');

  const nsi = `
Unicode true
Name "CSBU WorkMate Restart Manager UI Smoke"
OutFile "${nsisQuote(exePath)}"
RequestExecutionLevel user
SilentInstall normal
!define CSBU_WORKMATE_FALLBACK_LOG "csbu-workmate-installer-smoke-fallback.log"
!define VERSION "rstrtmgr-ui-smoke"
!define CSBU_WORKMATE_TARGET_ARCH "x64"
!define CSBU_WORKMATE_APP_EXECUTABLE_FILENAME "CSBU WorkMate.exe"
!define UNINSTALL_FILENAME "Uninstall CSBU WorkMate.exe"
!define PROJECT_DIR "${nsisQuote(repoRoot)}"
!include LogicLib.nsh
!include "${nsisQuote(messagesPath)}"
!include "${nsisQuote(processControlPath)}"

Var CsbuWorkMateSessionLogPath
Var CsbuWorkMateSessionId
Var CsbuWorkMateIsUpdated

Section
  StrCpy $INSTDIR "${nsisQuote(installDir)}"
  StrCpy $CsbuWorkMateSessionLogPath "${nsisQuote(logPath)}"
  StrCpy $CsbuWorkMateSessionId "rstrtmgrui"
  StrCpy $CsbuWorkMateIsUpdated "1"
  InitPluginsDir
  BringToFront

  csbu_workmate_query_lockers:
    !insertmacro CSBU_WORKMATE_QUERY_LOCKERS "${nsisQuote(lockedFile)}" $CsbuWorkMateLockerResult
    StrCpy $CsbuWorkMateLockerList ""
    ClearErrors
    SetDetailsPrint none
    FileOpen $CsbuWorkMateLockerListFile "$PLUGINSDIR\\csbu-workmate-rm-lockers.txt" r
    \${IfNot} \${Errors}
      FileRead $CsbuWorkMateLockerListFile $CsbuWorkMateLockerList
      FileClose $CsbuWorkMateLockerListFile
    \${EndIf}
    SetDetailsPrint lastused
    \${If} $CsbuWorkMateLockerList == ""
      StrCpy $CsbuWorkMateLockerList "\${CSBU_WORKMATE_MSG_UNKNOWN_PROCESS_EN}"
      StrCpy $CsbuWorkMateLockerListZh "\${CSBU_WORKMATE_MSG_UNKNOWN_PROCESS_ZH}"
      StrCpy $CsbuWorkMateLockerListEn "\${CSBU_WORKMATE_MSG_UNKNOWN_PROCESS_EN}"
    \${Else}
      StrCpy $CsbuWorkMateLockerListZh "$CsbuWorkMateLockerList"
      StrCpy $CsbuWorkMateLockerListEn "$CsbuWorkMateLockerList"
    \${EndIf}
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "\${CSBU_WORKMATE_MSG_FILE_OR_FOLDER_IN_USE_ZH}$\\r$\\n${nsisQuote(lockedFile)}$\\r$\\n$\\r$\\n\${CSBU_WORKMATE_MSG_APPLICATION_USING_IT_ZH}$\\r$\\n$CsbuWorkMateLockerListZh$\\r$\\n$\\r$\\n\${CSBU_WORKMATE_MSG_CLOSE_LISTED_RETRY_ZH}$\\r$\\n$\\r$\\n\${CSBU_WORKMATE_MSG_INSTALLER_LOG_ZH}:$\\r$\\n$CsbuWorkMateSessionLogPath$\\r$\\n$\\r$\\n\${CSBU_WORKMATE_MSG_BLOCK_SEPARATOR}$\\r$\\n$\\r$\\n\${CSBU_WORKMATE_MSG_FILE_OR_FOLDER_IN_USE_EN}$\\r$\\n${nsisQuote(lockedFile)}$\\r$\\n$\\r$\\n\${CSBU_WORKMATE_MSG_APPLICATION_USING_IT_EN}$\\r$\\n$CsbuWorkMateLockerListEn$\\r$\\n$\\r$\\n\${CSBU_WORKMATE_MSG_CLOSE_LISTED_RETRY_EN}$\\r$\\n$\\r$\\n\${CSBU_WORKMATE_MSG_INSTALLER_LOG_EN}:$\\r$\\n$CsbuWorkMateSessionLogPath" /SD IDCANCEL IDRETRY csbu_workmate_query_lockers
SectionEnd
`;

  writeFileSync(nsiPath, nsi, 'utf8');

  try {
    console.log(`[rstrtmgr-ui] makensis: ${makensis}`);
    console.log(`[rstrtmgr-ui] install dir: ${installDir}`);
    console.log(`[rstrtmgr-ui] locked file: ${lockedFile}`);
    console.log('[rstrtmgr-ui] compiling harness...');

    const compile = spawnSync(makensis, [nsiPath], { encoding: 'utf8' });
    if (compile.status !== 0) {
      process.stdout.write(compile.stdout || '');
      process.stderr.write(compile.stderr || '');
      throw new Error(`makensis failed with exit ${compile.status}`);
    }

    if (compileOnly) {
      console.log(`[rstrtmgr-ui] compile-only ok: ${exePath}`);
    } else {
      locker = spawnLocker(lockedFile);
      require('node:child_process').spawnSync(
        'powershell.exe',
        ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 800'],
        {
          stdio: 'ignore',
          windowsHide: true,
        }
      );
      console.log('[rstrtmgr-ui] launching harness. Click Cancel to finish; Retry re-runs locker detection.');
      const run = spawnSync(exePath, [], { stdio: 'inherit' });
      if (run.status !== 0) {
        throw new Error(`harness exited with ${run.status}`);
      }
    }

    if (!compileOnly && existsSync(logPath)) {
      const tail = readFileSync(logPath, 'utf8').trim().split(/\r?\n/).slice(-5).join('\n');
      if (tail) {
        console.log('[rstrtmgr-ui] log tail:');
        console.log(tail);
      }
    }
  } finally {
    if (locker) {
      try {
        locker.kill();
      } catch {}
    }
    rmSync(root, { recursive: true, force: true });
  }
}

try {
  main();
} catch (err) {
  console.error(`[rstrtmgr-ui] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
