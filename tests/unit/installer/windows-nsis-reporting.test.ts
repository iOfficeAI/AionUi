import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const windowsResourcesDir = 'resources/windows';
const execFileAsync = promisify(execFile);

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
  it('sends reports only when the user selects Yes and attaches the current installer log', () => {
    const errorsSentry = read(join(windowsResourcesDir, 'installer-errors-sentry.nsh'));
    const failUx = macroBody(errorsSentry, 'AIONUI_FAIL_UX');
    const silentBranch = failUx.indexOf('${If} ${Silent}');
    const consentDefault = failUx.indexOf('StrCpy $9 "yes"');
    const declinedChoice = failUx.indexOf('StrCpy $9 "no"');
    const reportCall = failUx.indexOf('!insertmacro AIONUI_REPORT_TO_SENTRY "${_CODE}" "${_DETAIL}"');
    const noUiReportCall = failUx.indexOf('!insertmacro AIONUI_REPORT_TO_SENTRY_NOUI "${_CODE}" "${_DETAIL}"');
    const autoLog = failUx.indexOf('event=report-auto reason=silent');
    const declinedLog = failUx.indexOf('event=report-skipped reason=user-declined');
    const markerCleanup = failUx.indexOf('!insertmacro AIONUI_CLEAR_ACTIVE_INSTALLER_MARKER');

    expect(errorsSentry).toContain('MB_YESNO|MB_ICONSTOP');
    expect(silentBranch).toBeGreaterThanOrEqual(0);
    expect(consentDefault).toBeGreaterThan(silentBranch);
    expect(declinedChoice).toBeGreaterThan(consentDefault);
    expect(declinedLog).toBeGreaterThan(declinedChoice);
    expect(autoLog).toBeGreaterThan(declinedLog);
    expect(noUiReportCall).toBeGreaterThan(autoLog);
    expect(reportCall).toBeGreaterThan(noUiReportCall);
    expect(markerCleanup).toBeGreaterThan(reportCall);
    expect(failUx).not.toContain('aionui_report_declined:');
    expect(errorsSentry).toContain('File /oname=$PLUGINSDIR\\aionui-report-installer-failure.ps1');
    expect(errorsSentry).toContain('-File "$PLUGINSDIR\\aionui-report-installer-failure.ps1"');
  });

  it('leaves local breadcrumbs for Sentry report lookup and failures', () => {
    const errorsSentry = read(join(windowsResourcesDir, 'installer-errors-sentry.nsh'));
    const report = macroBody(errorsSentry, 'AIONUI_REPORT_TO_SENTRY');
    const reportNoUi = macroBody(errorsSentry, 'AIONUI_REPORT_TO_SENTRY_NOUI');
    const reportImpl = macroBody(errorsSentry, 'AIONUI_REPORT_TO_SENTRY_IMPL');
    const reportScript = read(join(windowsResourcesDir, 'support/report-installer-failure.ps1'));

    expect(report).toContain('AIONUI_REPORT_TO_SENTRY_IMPL "${_CODE}" "${_DETAIL}" ""');
    expect(reportNoUi).toContain('AIONUI_REPORT_TO_SENTRY_IMPL "${_CODE}" "${_DETAIL}" "-NoUi"');
    expect(reportImpl).toContain('${_NO_UI}');
    expect(reportImpl).toContain('-Code "${_CODE}"');
    expect(reportImpl).toContain('-Detail "${_DETAIL}"');
    expect(reportImpl).toContain('-LogPath "$AionUiSessionLogPath"');
    expect(reportImpl).toContain('-Session "$AionUiSessionId"');
    expect(reportScript).toContain("$statusPath = Join-Path $env:TEMP 'aionui-installer-report.json'");
    expect(reportScript).toContain("status = 'sent'");
    expect(reportScript).toContain("status = 'failed'");
    expect(reportScript).toContain("status = 'skipped'");
    expect(reportScript).toContain('eventId = $eventId');
    expect(reportScript).toContain('session = $Session');
    expect(reportScript).toContain('search = $search');
    expect(reportScript).toContain('event=report-sent code=');
    expect(reportScript).toContain('New-Object -ComObject WScript.Shell');
    expect(reportScript).toContain("$shell.Popup($text, 60, 'AionUi installer report', $style)");
    expect(reportScript).toContain('Add-Type -AssemblyName System.Windows.Forms');
    expect(reportScript).toContain('[System.Windows.Forms.MessageBox]::Show(');
    expect(reportScript).toContain('[System.Windows.Forms.MessageBoxIcon]::$icon');
    expect(reportScript).toContain('filename = $logFileName');
    expect(reportScript).toContain('TimeoutSec 10');
    expect(reportScript).toContain('event=report-failed');
    expect(reportScript).toContain('event=report-skipped reason=empty-dsn');
    expect(reportScript).toContain('content_type = \'text/plain\'');
  });

  const windowsIt = process.platform === 'win32' ? it : it.skip;

  windowsIt('sends a real Sentry envelope with the current installer log as an attachment', async () => {
    const reportScript = join(windowsResourcesDir, 'support/report-installer-failure.ps1');
    const tempRoot = mkdtempSync(join(tmpdir(), 'aionui-sentry-report-'));
    const logName = 'aionui-installer-2.1.27-20260702-151830-session123.log';
    const logPath = join(tempRoot, logName);
    const logText = 'installer log line for attachment smoke';
    writeFileSync(logPath, logText, 'utf8');

    let capturedBody = '';
    let capturedContentType = '';
    const server = createServer((req, res) => {
      capturedContentType = req.headers['content-type'] ?? '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        capturedBody += chunk;
      });
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    expect(address).not.toBeNull();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          reportScript,
          '-Dsn',
          `http://127.0.0.1:${port}/123`,
          '-LogPath',
          logPath,
          '-Code',
          'E1002',
          '-Detail',
          'old-uninstaller exitCode=2',
          '-Release',
          '2.1.27',
          '-Arch',
          'x64',
          '-Session',
          'session123',
          '-Updated',
          '1',
          '-NoUi',
        ],
        { encoding: 'utf8', env: { ...process.env, TEMP: tempRoot, TMP: tempRoot }, timeout: 30_000 },
      );

      const status = JSON.parse(readFileSync(join(tempRoot, 'aionui-installer-report.json'), 'utf8')) as {
        status: string;
        eventId: string;
        search: string;
      };

      expect(status.status).toBe('sent');
      expect(status.eventId).toMatch(/^[0-9a-f]{32}$/);
      expect(status.search).toContain('code:E1002');
      expect(capturedContentType).toContain('application/x-sentry-envelope');
      expect(capturedBody).toContain('"type":"event"');
      expect(capturedBody).toContain('"type":"attachment"');
      expect(capturedBody).toContain(`"filename":"${logName}"`);
      expect(capturedBody).toContain(logText);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }, 30_000);

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
