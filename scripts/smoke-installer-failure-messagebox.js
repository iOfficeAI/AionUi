#!/usr/bin/env node

const { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, copyFileSync, writeFileSync } = require('node:fs');
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

  const localAppData = process.env.LOCALAPPDATA;
  const cacheRoot = localAppData ? path.join(localAppData, 'electron-builder', 'Cache') : '';
  const candidates = [];

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

function copyHarnessProject(projectRoot) {
  const windowsDir = path.join(projectRoot, 'resources', 'windows');
  const supportDir = path.join(windowsDir, 'support');
  mkdirSync(supportDir, { recursive: true });

  for (const file of ['installer-observability.nsh', 'installer-errors-sentry.nsh', 'installer-messages.nsh']) {
    copyFileSync(path.join(repoRoot, 'resources', 'windows', file), path.join(windowsDir, file));
  }

  copyFileSync(
    path.join(repoRoot, 'resources', 'windows', 'support', 'report-installer-failure.ps1'),
    path.join(supportDir, 'report-installer-failure.ps1')
  );
  writeFileSync(path.join(supportDir, '_sentry-dsn.generated.nsh'), '!define AIONUI_SENTRY_DSN ""\n', 'utf8');
}

function getArg(name, fallback) {
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function main() {
  if (process.platform !== 'win32') {
    throw new Error('This smoke test only runs on Windows.');
  }

  const compileOnly = process.argv.includes('--compile-only');
  const code = getArg('--code', 'E1003');
  const wrapperCode = getArg('--wrapper-code', 'E1002');
  const makensis = findMakensis();
  const root = mkdtempSync(path.join(tmpdir(), 'aionui-failure-messagebox-'));
  const projectRoot = path.join(root, 'project');
  const nsiPath = path.join(root, 'aionui-failure-messagebox-smoke.nsi');
  const exePath = path.join(root, 'aionui-failure-messagebox-smoke.exe');
  const logPath = path.join(
    process.env.TEMP || tmpdir(),
    `aionui-installer-messagebox-smoke-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')}-log.jsonl`
  );

  copyHarnessProject(projectRoot);

  const nsi = `
Unicode true
Name "AionUi Failure MessageBox Smoke"
OutFile "${nsisQuote(exePath)}"
RequestExecutionLevel user
SilentInstall normal
!define PROJECT_DIR "${nsisQuote(projectRoot)}"
!define VERSION "0.0.0-smoke"
!define AIONUI_TARGET_ARCH "x64"
!define AIONUI_RUNTIME_KEY "win32-x64"
!include LogicLib.nsh
!include nsDialogs.nsh
!include "${nsisQuote(path.join(projectRoot, 'resources', 'windows', 'installer-observability.nsh'))}"
!macro AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER
!macroend
!include "${nsisQuote(path.join(projectRoot, 'resources', 'windows', 'installer-errors-sentry.nsh'))}"

Section
  StrCpy $INSTDIR "$TEMP\\AionUi-messagebox-smoke"
  StrCpy $AionUiSessionId "smokembox"
  StrCpy $AionUiIsUpdated "1"
  StrCpy $AionUiSessionLogPath "${nsisQuote(logPath)}"
  BringToFront
  !insertmacro AIONUI_FAIL_REPORTABLE_ROOTED_BILINGUAL_DIAGNOSTICS "${nsisQuote(code)}" "${nsisQuote(wrapperCode)}" "smoke-messagebox failedPath=$INSTDIR blockingProcess=Code.exe" "\${AIONUI_MSG_OLD_UNINSTALL_FAILED_EN}" "\${AIONUI_MSG_OLD_UNINSTALL_FAILED_ZH}" "\${AIONUI_MSG_OLD_UNINSTALL_ACTION_EN}" "\${AIONUI_MSG_OLD_UNINSTALL_ACTION_ZH}" "- Failure: previous uninstaller failed with ${nsisQuote(code)}$\\r$\\n- File or folder: $INSTDIR$\\r$\\n- Blocking process: Code.exe" "- Failure: previous uninstaller failed with ${nsisQuote(code)}$\\r$\\n- File or folder: $INSTDIR$\\r$\\n- Blocking process: Code.exe"
SectionEnd
`;

  writeFileSync(nsiPath, nsi, 'utf8');

  try {
    console.log(`[failure-messagebox] makensis: ${makensis}`);
    console.log(`[failure-messagebox] compiling harness...`);
    const compile = spawnSync(makensis, [nsiPath], { encoding: 'utf8' });
    if (compile.status !== 0) {
      process.stdout.write(compile.stdout || '');
      process.stderr.write(compile.stderr || '');
      throw new Error(`makensis failed with exit ${compile.status}`);
    }

    if (compileOnly) {
      console.log(`[failure-messagebox] compile-only ok: ${exePath}`);
      return;
    }

    console.log('[failure-messagebox] launching harness. Click No to close without attempting report upload.');
    const run = spawnSync(exePath, [], { stdio: 'inherit' });
    if (run.status !== 2) {
      throw new Error(`harness exited with ${run.status}; expected installer failure exit code 2`);
    }
  } finally {
    if (compileOnly) {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

try {
  main();
} catch (err) {
  console.error(`[failure-messagebox] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
