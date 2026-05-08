/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type QuitEvent = {
  preventDefault: () => void;
};

type Logger = Pick<Console, 'error' | 'warn'>;

type AppShutdownCoordinatorOptions = {
  cleanup: () => Promise<void>;
  prepare?: () => void;
  requestQuit: () => void;
  exit: (code: number) => void;
  timeoutMs: number;
  logger?: Logger;
};

const signalExitCode = (signal: NodeJS.Signals): number => {
  switch (signal) {
    case 'SIGINT':
      return 130;
    case 'SIGTERM':
      return 143;
    default:
      return 1;
  }
};

export function createAppShutdownCoordinator(options: AppShutdownCoordinatorOptions) {
  const logger = options.logger ?? console;
  let prepared = false;
  let cleanupComplete = false;
  let quitRequested = false;
  let cleanupPromise: Promise<void> | undefined;

  const prepareOnce = () => {
    if (prepared) return;
    prepared = true;
    options.prepare?.();
  };

  const runCleanup = (): Promise<void> => {
    if (cleanupPromise) return cleanupPromise;

    prepareOnce();
    cleanupPromise = Promise.race([
      options.cleanup(),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          logger.warn(`[AionUi] Cleanup timed out after ${options.timeoutMs / 1000}s, forcing quit`);
          resolve();
        }, options.timeoutMs);
      }),
    ])
      .catch((error) => {
        logger.error('[AionUi] Cleanup failed during shutdown:', error);
      })
      .finally(() => {
        cleanupComplete = true;
      });

    return cleanupPromise;
  };

  const requestQuitOnce = () => {
    if (quitRequested) return;
    quitRequested = true;
    options.requestQuit();
  };

  const handleBeforeQuit = (event: QuitEvent): void => {
    if (cleanupComplete) return;

    event.preventDefault();
    void runCleanup().finally(requestQuitOnce);
  };

  const handleSignal = (signal: NodeJS.Signals): void => {
    void runCleanup().finally(() => {
      options.exit(signalExitCode(signal));
    });
  };

  return {
    handleBeforeQuit,
    handleSignal,
  };
}
