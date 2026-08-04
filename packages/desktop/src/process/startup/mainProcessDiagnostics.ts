type MainProcessEvents = {
  on(event: 'uncaughtException', listener: (error: Error) => void): unknown;
  on(event: 'unhandledRejection', listener: (reason: unknown, promise: Promise<unknown>) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
};

type MainProcessDiagnosticsDeps = {
  process: MainProcessEvents;
  logError: (message: string, value: unknown) => void;
  logInfo: (message: string) => void;
};

type LocalCrashReporterDeps = {
  start: (options: { uploadToServer: false; globalExtra: Record<string, string> }) => void;
  appVersion: string;
  crashDumpsPath: string;
  logInfo: (message: string) => void;
  logError: (message: string, value: unknown) => void;
};

export const WINDOWS_APP_USER_MODEL_ID = 'com.csbu.workmate';
export const SAFE_MODE_SWITCH = '--safe-mode';

export const isSafeModeLaunch = (argv: readonly string[] = process.argv): boolean => argv.includes(SAFE_MODE_SWITCH);

export function configureWindowsNotificationIdentity({
  platform,
  setAppUserModelId,
}: {
  platform: NodeJS.Platform;
  setAppUserModelId: (id: string) => void;
}): void {
  if (platform === 'win32') {
    setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
  }
}

function safelyLog(log: (message: string, value: unknown) => void, message: string, value: unknown): void {
  try {
    log(message, value);
  } catch {
    // An exception handler must never throw recursively if the log transport
    // itself is unavailable (disk full, closed stream, or shutdown race).
  }
}

/** Install durable diagnostics for failures that otherwise terminate Electron silently. */
export function installMainProcessDiagnostics({ process, logError, logInfo }: MainProcessDiagnosticsDeps): void {
  process.on('uncaughtException', (error) => {
    safelyLog(logError, '[CSBU WorkMate] uncaught exception in main process', error);
  });
  process.on('unhandledRejection', (reason) => {
    safelyLog(logError, '[CSBU WorkMate] unhandled rejection in main process', reason);
  });
  process.on('exit', (code) => {
    try {
      logInfo(`[CSBU WorkMate] main process exit (code=${code})`);
    } catch {
      // The exit event only permits synchronous best-effort work.
    }
  });
}

/** Enable local Crashpad dumps for native main/renderer/GPU crashes. */
export function startLocalCrashReporter({
  start,
  appVersion,
  crashDumpsPath,
  logInfo,
  logError,
}: LocalCrashReporterDeps): void {
  try {
    start({
      uploadToServer: false,
      globalExtra: {
        appVersion,
        distribution: 'csbu-workmate',
      },
    });
    logInfo(`[CSBU WorkMate] Local crash dumps enabled: ${crashDumpsPath}`);
  } catch (error) {
    safelyLog(logError, '[CSBU WorkMate] Failed to enable local crash dumps', error);
  }
}
