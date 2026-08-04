import type { CrashRecoveryState } from '@/common/adapter/ipcBridge';
import * as fs from 'node:fs';
import * as path from 'node:path';

const STATE_VERSION = 1;
const MAX_HANDLED_REPORTS = 20;
const STATE_FILE_NAME = 'crash-recovery-state.json';

type SessionRecord = {
  appVersion: string;
  arch: string;
  cleanExitAt?: number;
  electronVersion: string;
  id: string;
  pid: number;
  platform: string;
  startedAt: number;
};

type PersistedCrashRecoveryState = {
  activeSession?: SessionRecord;
  handledReportIds: string[];
  version: number;
};

type CrashReport = { id: string; occurredAt: number };

export type CrashRecoveryServiceOptions = {
  appVersion: string;
  arch: string;
  crashDumpsPath: string;
  electronVersion: string;
  now?: () => number;
  pid: number;
  platform: string;
  randomId?: () => string;
  safeMode: boolean;
  userDataPath: string;
};

const emptyState = (): PersistedCrashRecoveryState => ({ handledReportIds: [], version: STATE_VERSION });

const isSessionRecord = (value: unknown): value is SessionRecord => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<SessionRecord>;
  return (
    typeof record.appVersion === 'string' &&
    typeof record.arch === 'string' &&
    typeof record.electronVersion === 'string' &&
    typeof record.id === 'string' &&
    typeof record.pid === 'number' &&
    typeof record.platform === 'string' &&
    typeof record.startedAt === 'number' &&
    (record.cleanExitAt === undefined || typeof record.cleanExitAt === 'number')
  );
};

const parseState = (raw: string): PersistedCrashRecoveryState => {
  const value = JSON.parse(raw) as Partial<PersistedCrashRecoveryState>;
  if (value.version !== STATE_VERSION || !Array.isArray(value.handledReportIds)) return emptyState();
  return {
    activeSession: isSessionRecord(value.activeSession) ? value.activeSession : undefined,
    handledReportIds: value.handledReportIds
      .filter((id): id is string => typeof id === 'string')
      .slice(-MAX_HANDLED_REPORTS),
    version: STATE_VERSION,
  };
};

export class CrashRecoveryService {
  private readonly now: () => number;
  private readonly options: CrashRecoveryServiceOptions;
  private readonly statePath: string;
  private state: PersistedCrashRecoveryState;
  private recoveryState: CrashRecoveryState;

  constructor(options: CrashRecoveryServiceOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.statePath = path.join(options.userDataPath, STATE_FILE_NAME);
    this.state = this.readState();
    this.recoveryState = this.detectPreviousCrash();
    this.startSession();
  }

  getRecoveryState(): CrashRecoveryState {
    return { ...this.recoveryState };
  }

  dismiss(reportId: string): void {
    if (!reportId || this.state.handledReportIds.includes(reportId)) return;
    this.state.handledReportIds = [...this.state.handledReportIds, reportId].slice(-MAX_HANDLED_REPORTS);
    this.writeState();
    if (this.recoveryState.reportId === reportId) {
      this.recoveryState = { detected: false, safeMode: this.options.safeMode };
    }
  }

  markCleanExit(): void {
    const activeSession = this.state.activeSession;
    if (!activeSession || activeSession.cleanExitAt) return;
    this.state.activeSession = { ...activeSession, cleanExitAt: this.now() };
    this.writeState();
  }

  private readState(): PersistedCrashRecoveryState {
    try {
      return parseState(fs.readFileSync(this.statePath, 'utf8'));
    } catch {
      return emptyState();
    }
  }

  private listCrashReports(): CrashReport[] {
    const reports = new Map<string, CrashReport>();
    // Crashpad stores Windows reports in `reports/`. Its generic database used
    // by Linux and macOS moves finished dumps through `pending/` and
    // `completed/`, especially when uploads are disabled. Keep the root as a
    // compatibility fallback for Electron distributions that expose dumps
    // directly under app.getPath('crashDumps').
    const reportDirectories = ['reports', 'pending', 'completed'].map((directory) =>
      path.join(this.options.crashDumpsPath, directory)
    );
    reportDirectories.push(this.options.crashDumpsPath);
    for (const reportsDirectory of reportDirectories) {
      try {
        for (const entry of fs.readdirSync(reportsDirectory, { withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.dmp')) continue;
          const reportPath = path.join(reportsDirectory, entry.name);
          const report = {
            id: path.basename(entry.name, path.extname(entry.name)),
            occurredAt: fs.statSync(reportPath).mtimeMs,
          };
          reports.set(report.id, report);
        }
      } catch {
        // Missing or temporarily locked Crashpad locations are safe.
      }
    }
    return [...reports.values()].toSorted((left, right) => right.occurredAt - left.occurredAt);
  }

  private detectPreviousCrash(): CrashRecoveryState {
    const previous = this.state.activeSession;
    if (!previous || previous.cleanExitAt) return { detected: false, safeMode: this.options.safeMode };

    const report = this.listCrashReports().find(
      (candidate) => candidate.occurredAt >= previous.startedAt && !this.state.handledReportIds.includes(candidate.id)
    );
    if (!report) return { detected: false, safeMode: this.options.safeMode };

    return {
      detected: true,
      occurredAt: report.occurredAt,
      previousAppVersion: previous.appVersion,
      reportId: report.id,
      safeMode: this.options.safeMode,
    };
  }

  private startSession(): void {
    const startedAt = this.now();
    this.state.activeSession = {
      appVersion: this.options.appVersion,
      arch: this.options.arch,
      electronVersion: this.options.electronVersion,
      id: this.options.randomId?.() ?? `${this.options.pid}-${startedAt}`,
      pid: this.options.pid,
      platform: this.options.platform,
      startedAt,
    };
    this.writeState();
  }

  private writeState(): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      const temporaryPath = `${this.statePath}.${process.pid}.tmp`;
      fs.writeFileSync(temporaryPath, JSON.stringify(this.state), 'utf8');
      fs.renameSync(temporaryPath, this.statePath);
    } catch (error) {
      console.warn('[CrashRecovery] Failed to persist recovery state:', error);
    }
  }
}

let activeService: CrashRecoveryService | null = null;

export const setCrashRecoveryService = (service: CrashRecoveryService): void => {
  activeService = service;
};

export const getCrashRecoveryService = (): CrashRecoveryService | null => activeService;
