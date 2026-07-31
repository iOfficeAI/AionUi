#!/usr/bin/env node

const { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

function nsisQuote(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '$\\"').replace(/\$/g, '$$');
}

function findMakensis() {
  if (process.env.MAKENSIS && existsSync(process.env.MAKENSIS)) {
    return process.env.MAKENSIS;
  }

  const candidates = [];
  const cacheRoot = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache') : '';

  function walk(dir, depth = 0) {
    if (!dir || depth > 5 || !existsSync(dir)) {
      return;
    }

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
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

function readJsonl(logPath) {
  return readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line.replace(/^\uFEFF/, '')));
}

function normalizeWinPath(value) {
  return path.win32.normalize(String(value).replace(/\\\\/g, '\\'));
}

function main() {
  if (process.platform !== 'win32') {
    throw new Error('This smoke test only runs on Windows.');
  }

  const makensis = findMakensis();
  const root = mkdtempSync(path.join(tmpdir(), 'csbu-workmate-self-lock-'));
  const installDir = path.join(root, 'install-dir');
  mkdirSync(installDir, { recursive: true });
  writeFileSync(path.join(installDir, 'existing-file.txt'), 'self-lock smoke\n', 'utf8');

  const nsiPath = path.join(root, 'csbu-workmate-self-lock-smoke.nsi');
  const exePath = path.join(root, 'csbu-workmate-self-lock-smoke.exe');
  const logPath = path.join(
    process.env.TEMP || tmpdir(),
    `csbu-workmate-installer-self-lock-${new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+$/, '')
      .replace('T', '-')}-log.jsonl`
  );
  const resultPath = path.join(process.env.TEMP || tmpdir(), `csbu-workmate-installer-self-lock-${process.pid}-result.txt`);
  const processControlPath = path.join(repoRoot, 'resources', 'windows', 'installer-process-control.nsh');

  const nsi = `
Unicode true
Name "CSBU WorkMate Installer Self Lock Smoke"
OutFile "${nsisQuote(exePath)}"
RequestExecutionLevel user
SilentInstall silent
!define VERSION "self-lock-smoke"
!define CSBU_WORKMATE_TARGET_ARCH "x64"
!define CSBU_WORKMATE_FALLBACK_LOG "csbu-workmate-installer-self-lock-fallback.log"
!define CSBU_WORKMATE_APP_EXECUTABLE_FILENAME "CSBU WorkMate.exe"
!define UNINSTALL_FILENAME "Uninstall CSBU WorkMate.exe"
!define PROJECT_DIR "${nsisQuote(repoRoot)}"
!include LogicLib.nsh
!include "${nsisQuote(processControlPath)}"

Var CsbuWorkMateSessionId
Var CsbuWorkMateIsUpdated
Var CsbuWorkMateSessionLogPath
Var ResultFile

Section
  StrCpy $INSTDIR "${nsisQuote(installDir)}"
  StrCpy $CsbuWorkMateSessionId "selflock"
  StrCpy $CsbuWorkMateIsUpdated "1"
  StrCpy $CsbuWorkMateSessionLogPath "${nsisQuote(logPath)}"
  StrCpy $ResultFile "${nsisQuote(resultPath)}"
  InitPluginsDir
  SetOutPath $INSTDIR
  StrCpy $CsbuWorkMateCurrentOutDir "$INSTDIR"
  !insertmacro CSBU_WORKMATE_QUERY_LOCKERS "$INSTDIR" $CsbuWorkMateLockerResult
  FileOpen $0 "$ResultFile" w
  FileWrite $0 "$CsbuWorkMateLockerResult"
  FileWrite $0 "|$CsbuWorkMateCurrentOutDir|$CsbuWorkMateSessionLogPath"
  FileClose $0
  \${If} $CsbuWorkMateLockerResult != 0
    SetErrorLevel 10
    Quit
  \${EndIf}
SectionEnd
`;

  try {
    writeFileSync(nsiPath, nsi, 'utf8');
    console.log(`[self-lock] makensis: ${makensis}`);
    const compile = spawnSync(makensis, [nsiPath], { encoding: 'utf8' });
    if (compile.status !== 0) {
      process.stdout.write(compile.stdout || '');
      process.stderr.write(compile.stderr || '');
      throw new Error(`makensis failed with exit ${compile.status}`);
    }

    const run = spawnSync(exePath, [], { encoding: 'utf8' });
    if (run.status !== 0) {
      process.stdout.write(run.stdout || '');
      process.stderr.write(run.stderr || '');
      const result = existsSync(resultPath) ? readFileSync(resultPath, 'utf8') : '<missing>';
      throw new Error(`self-lock harness exited with ${run.status}; locker result=${result}`);
    }

    const events = readJsonl(logPath);
    const lockers =
      events.findLast?.((event) => event.event === 'rm-lockers') ??
      events.filter((event) => event.event === 'rm-lockers').at(-1);
    if (!lockers) {
      throw new Error(`rm-lockers event missing: ${logPath}`);
    }
    if (lockers.fallbackReason !== 'installer-self-lock') {
      throw new Error(`expected installer-self-lock, got ${lockers.fallbackReason || '<empty>'}`);
    }
    if (normalizeWinPath(lockers.currentOutDir) !== normalizeWinPath(installDir)) {
      throw new Error(`expected currentOutDir ${installDir}, got ${lockers.currentOutDir}`);
    }
    const blocking = lockers.blockingProcesses || [];
    if (!blocking.some((process) => process.name === 'CSBU WorkMate installer' && Number(process.pid) > 0)) {
      throw new Error(`expected CSBU WorkMate installer blocker, got ${JSON.stringify(blocking)}`);
    }

    console.log(`[self-lock] ok: ${logPath}`);
  } finally {
    rmSync(resultPath, { force: true });
    rmSync(root, { recursive: true, force: true });
  }
}

try {
  main();
} catch (err) {
  console.error(`[self-lock] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
