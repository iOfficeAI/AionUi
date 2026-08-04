import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CrashRecoveryService } from '@process/services/CrashRecoveryService';

let rootPath: string;
let userDataPath: string;
let crashDumpsPath: string;
let now: number;

const createService = (safeMode = false) =>
  new CrashRecoveryService({
    appVersion: '2.1.47',
    arch: 'x64',
    crashDumpsPath,
    electronVersion: '37.10.3',
    now: () => now,
    pid: 1234,
    platform: 'win32',
    randomId: () => `session-${now}`,
    safeMode,
    userDataPath,
  });

const writeReport = (id: string, occurredAt: number) => {
  const reportsPath = path.join(crashDumpsPath, 'reports');
  fs.mkdirSync(reportsPath, { recursive: true });
  const reportPath = path.join(reportsPath, `${id}.dmp`);
  fs.writeFileSync(reportPath, 'minidump');
  const reportTime = new Date(occurredAt);
  fs.utimesSync(reportPath, reportTime, reportTime);
};

describe('CrashRecoveryService', () => {
  beforeEach(() => {
    rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-recovery-test-'));
    userDataPath = path.join(rootPath, 'user-data');
    crashDumpsPath = path.join(rootPath, 'crash-dumps');
    now = 1_000_000;
  });

  afterEach(() => {
    fs.rmSync(rootPath, { recursive: true, force: true });
  });

  it('does not report a cleanly exited session', () => {
    const first = createService();
    first.markCleanExit();
    writeReport('after-clean-exit', now + 100);
    now += 200;

    expect(createService().getRecoveryState()).toEqual({ detected: false, safeMode: false });
  });

  it('reports a new native dump once and remembers dismissal', () => {
    createService();
    writeReport('native-crash', now + 100);
    now += 200;
    const recovered = createService(true);

    expect(recovered.getRecoveryState()).toMatchObject({
      detected: true,
      previousAppVersion: '2.1.47',
      reportId: 'native-crash',
      safeMode: true,
    });

    recovered.dismiss('native-crash');
    now += 200;
    expect(createService().getRecoveryState()).toEqual({ detected: false, safeMode: false });
  });

  it('does not classify an unclean exit without a dump as a native crash', () => {
    createService();
    now += 200;
    expect(createService().getRecoveryState()).toEqual({ detected: false, safeMode: false });
  });

  it('detects a dump stored directly in the cross-platform crash dumps directory', () => {
    createService();
    fs.mkdirSync(crashDumpsPath, { recursive: true });
    const reportPath = path.join(crashDumpsPath, 'direct-report.dmp');
    fs.writeFileSync(reportPath, 'minidump');
    const reportTime = new Date(now + 100);
    fs.utimesSync(reportPath, reportTime, reportTime);
    now += 200;

    expect(createService().getRecoveryState()).toMatchObject({ detected: true, reportId: 'direct-report' });
  });

  it.each(['pending', 'completed'])('detects a dump in the generic Crashpad %s directory', (directory) => {
    createService();
    const reportsPath = path.join(crashDumpsPath, directory);
    fs.mkdirSync(reportsPath, { recursive: true });
    const reportPath = path.join(reportsPath, `${directory}-report.dmp`);
    fs.writeFileSync(reportPath, 'minidump');
    const reportTime = new Date(now + 100);
    fs.utimesSync(reportPath, reportTime, reportTime);
    now += 200;

    expect(createService().getRecoveryState()).toMatchObject({
      detected: true,
      reportId: `${directory}-report`,
    });
  });

  it('safely replaces malformed state instead of showing a recovery prompt', () => {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(path.join(userDataPath, 'crash-recovery-state.json'), '{broken');

    expect(createService().getRecoveryState()).toEqual({ detected: false, safeMode: false });
    expect(() =>
      JSON.parse(fs.readFileSync(path.join(userDataPath, 'crash-recovery-state.json'), 'utf8'))
    ).not.toThrow();
  });
});
