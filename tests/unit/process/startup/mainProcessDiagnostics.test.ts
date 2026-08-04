import { describe, expect, it, vi } from 'vitest';
import {
  configureWindowsNotificationIdentity,
  installMainProcessDiagnostics,
  isSafeModeLaunch,
  startLocalCrashReporter,
  WINDOWS_APP_USER_MODEL_ID,
} from '@process/startup/mainProcessDiagnostics';

type Listener = (...args: never[]) => void;

describe('main process launch configuration', () => {
  it('sets an explicit Windows application identity before notifications are created', () => {
    const setAppUserModelId = vi.fn();

    configureWindowsNotificationIdentity({ platform: 'win32', setAppUserModelId });

    expect(setAppUserModelId).toHaveBeenCalledWith(WINDOWS_APP_USER_MODEL_ID);
  });

  it('does not set a Windows application identity on macOS or Linux', () => {
    const setAppUserModelId = vi.fn();
    configureWindowsNotificationIdentity({ platform: 'darwin', setAppUserModelId });
    configureWindowsNotificationIdentity({ platform: 'linux', setAppUserModelId });
    expect(setAppUserModelId).not.toHaveBeenCalled();
  });

  it('recognizes safe mode as a one-time launch switch', () => {
    expect(isSafeModeLaunch(['app', '--safe-mode'])).toBe(true);
    expect(isSafeModeLaunch(['app'])).toBe(false);
  });
});

describe('installMainProcessDiagnostics', () => {
  function setup() {
    const listeners = new Map<string, Listener>();
    const logError = vi.fn();
    const logInfo = vi.fn();

    installMainProcessDiagnostics({
      process: {
        on: vi.fn((event: string, listener: Listener) => {
          listeners.set(event, listener);
        }),
      },
      logError,
      logInfo,
    });

    return { listeners, logError, logInfo };
  }

  it('logs uncaught exceptions and rejected values', () => {
    const { listeners, logError } = setup();
    const error = new Error('renderer bridge failed');
    listeners.get('uncaughtException')?.(error as never);
    listeners.get('unhandledRejection')?.({ code: 'EPIPE' } as never);

    expect(logError).toHaveBeenNthCalledWith(1, '[CSBU WorkMate] uncaught exception in main process', error);
    expect(logError).toHaveBeenNthCalledWith(2, '[CSBU WorkMate] unhandled rejection in main process', {
      code: 'EPIPE',
    });
  });

  it('logs process exit codes', () => {
    const { listeners, logInfo } = setup();
    listeners.get('exit')?.(7 as never);
    expect(logInfo).toHaveBeenCalledWith('[CSBU WorkMate] main process exit (code=7)');
  });

  it('does not recursively throw when the log transport fails', () => {
    const { listeners } = setup();
    const brokenLog = vi.fn(() => {
      throw new Error('disk unavailable');
    });
    installMainProcessDiagnostics({
      process: {
        on: vi.fn((event: string, listener: Listener) => {
          listeners.set(event, listener);
        }),
      },
      logError: brokenLog,
      logInfo: brokenLog,
    });

    expect(() => listeners.get('uncaughtException')?.(new Error('original') as never)).not.toThrow();
  });
});

describe('startLocalCrashReporter', () => {
  it('enables local-only native crash dumps', () => {
    const start = vi.fn();
    const logInfo = vi.fn();

    startLocalCrashReporter({
      start,
      appVersion: '2.1.47',
      crashDumpsPath: 'C:\\data\\Crashpad',
      logInfo,
      logError: vi.fn(),
    });

    expect(start).toHaveBeenCalledWith({
      uploadToServer: false,
      globalExtra: { appVersion: '2.1.47', distribution: 'csbu-workmate' },
    });
    expect(logInfo).toHaveBeenCalledWith('[CSBU WorkMate] Local crash dumps enabled: C:\\data\\Crashpad');
  });

  it('contains crash reporter startup failures', () => {
    const error = new Error('Crashpad unavailable');
    const logError = vi.fn();

    expect(() =>
      startLocalCrashReporter({
        start: () => {
          throw error;
        },
        appVersion: '2.1.47',
        crashDumpsPath: 'C:\\data\\Crashpad',
        logInfo: vi.fn(),
        logError,
      })
    ).not.toThrow();
    expect(logError).toHaveBeenCalledWith('[CSBU WorkMate] Failed to enable local crash dumps', error);
  });
});
